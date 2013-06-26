var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Client = require(__dirname+'/client');
var defaults =  require(__dirname + '/defaults');
var pool = require(__dirname + '/pool');
var types = require(__dirname + '/types/');
var Connection = require(__dirname + '/connection');

var PG = function(clientConstructor) {
  EventEmitter.call(this);
  this.defaults = defaults;
  this.Client = pool.Client = clientConstructor;
  this.Query = this.Client.Query;
  this.pools = pool;
  this.types = types;
  this.Connection = Connection;
};

util.inherits(PG, EventEmitter);

PG.prototype.end = function() {
  var self = this;
  Object.keys(self.pools.all).forEach(function(key) {
    var pool = self.pools.all[key];
    pool.drain(function() {
      pool.destroyAllNow();
    });
  });
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
  var c = config;
  //allow for no config to be passed
  if(typeof c === 'function') {
    c = defaults;
  }
  var cancellingClient = new this.Client(c);
  cancellingClient.cancel(client, query);
};

var forceNative = Object.prototype.hasOwnProperty.call(process.env, 'NODE_PG_FORCE_NATIVE');
if (forceNative) {
  module.exports = new PG(require(__dirname + '/native'));
} else {
  module.exports = new PG(Client);

  //lazy require native module...the native module may not have installed
  module.exports.__defineGetter__("native", function() {
    delete module.exports.native;
    module.exports.native = new PG(require(__dirname + '/native'));
    return module.exports.native;
  });
}
