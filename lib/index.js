var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Client = require(__dirname+'/client');
var defaults =  require(__dirname + '/defaults');

//external genericPool module
var genericPool = require('generic-pool');

//cache of existing client pools
var pools = {};

var PG = function(clientConstructor) {
  EventEmitter.call(this);
  this.Client = clientConstructor;
  this.Connection = require(__dirname + '/connection');
  this.defaults = defaults;
};

util.inherits(PG, EventEmitter);

PG.prototype.end = function() {
  Object.keys(pools).forEach(function(name) {
    var pool = pools[name];
    pool.drain(function() {
      pool.destroyAllNow();
    });
  })
}

PG.prototype.connect = function(config, callback) {
  var self = this;
  var c = config;
  var cb = callback;
  //allow for no config to be passed
  if(typeof c === 'function') {
    cb = c;
    c = defaults;
  }

  //get unique pool name even if object was used as config
  var poolName = typeof(c) === 'string' ? c : c.user+c.host+c.port+c.database;
  var pool = pools[poolName];

  if(pool) return pool.acquire(cb);

  var pool = pools[poolName] = genericPool.Pool({
    name: poolName,
    create: function(callback) {
      var client = new self.Client(c);
      client.connect();

      var connectError = function(err) {
        client.removeListener('connect', connectSuccess);
        callback(err, null);
      };

      var connectSuccess = function() {
        client.removeListener('error', connectError);

        //handle connected client background errors by emitting event
        //via the pg object and then removing errored client from the pool
        client.on('error', function(e) {
          self.emit('error', e, client);
          pool.destroy(client);
        });
        callback(null, client);
      };

      client.once('connect', connectSuccess);
      client.once('error', connectError);
      client.on('drain', function() {
        pool.release(client);
      });
    },
    destroy: function(client) {
      client.end();
    },
    max: defaults.poolSize,
    idleTimeoutMillis: defaults.poolIdleTimeout
  });
  return pool.acquire(cb);
}

var getClient = function(config) {
  var c = config;
  //allow for no config to be passed
  if(typeof c === 'function')
    c = defaults;
  return new this.Client(c);
};

// cancel a query runned by the given client
PG.prototype.cancel = function(config, client, query) {
  getClient(config).cancel(client, query);
};

// cancel the active query runned by the given client
PG.prototype.cancelActiveQuery = function(config, client) {
  getClient(config).cancelActiveQuery(client);
};

// cancel all the queries of the given client (active and in queue)
PG.prototype.cancelAll = function(config, client) {
	getClient(config).cancelAll(client);
};

module.exports = new PG(Client);

//lazy require native module...the native module may not have installed
module.exports.__defineGetter__("native", function() {
  delete module.exports.native;
  return (module.exports.native = new PG(require(__dirname + '/native')));
})
