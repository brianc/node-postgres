var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Client = require(__dirname+'/client');
var defaults =  require(__dirname + '/defaults');
var pool = require(__dirname + '/pool');
var Connection = require(__dirname + '/connection');

var PG = function(clientConstructor) {
  EventEmitter.call(this);
  this.defaults = defaults;
  this.Client = pool.Client = clientConstructor;
  this.Query = this.Client.Query;
  this.pools = pool;
  this.Connection = Connection;
  this.types = require('pg-types');
};

util.inherits(PG, EventEmitter);

PG.prototype.end = function(config) {
  var self = this;
  var pool;
  if (config) {
    pool = self.pools.get(config);
    if (pool) pool.end();
  } else {
    forEachOf(self.pools.all, function (pool, name, callback) {
      pool.end(callback);
    }, function () {
      self.emit('end');
    });
  }
};

function forEachOf(object, iterator, callback) {
  var keys = Object.keys(object);
  var count = keys.length;
  if (count === 0) {
    callback();
  } else {
    keys.forEach(function (key) {
      iterator(object[key], key, function () {
        count--;
        if (count === 0) {
          callback();
        }
      });
    });
  }
}


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
    module.exports.native = new PG(require('./native'));
    return module.exports.native;
  });
}
