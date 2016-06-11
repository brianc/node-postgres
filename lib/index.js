var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Client = require('./client');
var defaults =  require('./defaults');
var pool = require('./pool');
var Connection = require('./connection');

var PG = function(clientConstructor) {
  EventEmitter.call(this);
  this.defaults = defaults;
  this.Client = clientConstructor;
  this.Query = this.Client.Query;
  this.pools = pool(clientConstructor);
  this.Connection = Connection;
  this.types = require('pg-types');
};

util.inherits(PG, EventEmitter);

PG.prototype.end = function() {
  var self = this;
  var keys = Object.keys(self.pools.all);
  var count = keys.length;
  if(count === 0) {
    self.emit('end');
  } else {
    keys.forEach(function(key) {
      var pool = self.pools.all[key];
      delete self.pools.all[key];
      pool.drain(function() {
        pool.destroyAllNow(function() {
          count--;
          if(count === 0) {
            self.emit('end');
          }
        });
      });
    });
  }
};


PG.prototype.connect = function(config, callback) {
  if(typeof config == "function") {
    callback = config;
    config = null;
  }
  var pool = this.pools.getOrCreate(config);
  pool.connect(callback);
  if(!pool.listeners('error').length) {
    //propagate errors up to pg object
    pool.on('error', this.emit.bind(this, 'error'));
  }
};

// cancel the query runned by the given client
PG.prototype.cancel = function(config, client, query) {
  if(client.native) {
    return client.cancel(query);
  }
  var c = config;
  //allow for no config to be passed
  if(typeof c === 'function') {
    c = defaults;
  }
  var cancellingClient = new this.Client(c);
  cancellingClient.cancel(client, query);
};

if(typeof process.env.NODE_PG_FORCE_NATIVE != 'undefined') {
  module.exports = new PG(require('./native'));
} else {
  module.exports = new PG(Client);

  //lazy require native module...the native module may not have installed
  module.exports.__defineGetter__("native", function() {
    delete module.exports.native;
    var native = null;
    try {
      native = new PG(require('./native'));
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') {
        throw err;
      }
      console.error(err.message);
    }
    module.exports.native = native;
    return native;
  });
}
