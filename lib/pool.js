var EventEmitter = require('events').EventEmitter;

var defaults = require(__dirname + '/defaults');
var genericPool = require('generic-pool');

var pools = {
  //dictionary of all key:pool pairs
  all: {},
  //reference to the client constructor - can override in tests or for require('pg').native
  Client: require(__dirname + '/client'),
  getOrCreate: function(clientConfig) {
    clientConfig = clientConfig || {};
    var name = JSON.stringify(clientConfig);
    var pool = pools.all[name];
    if(pool) {
      return pool;
    }
    pool = genericPool.Pool({
      name: name,
      max: defaults.poolSize,
      idleTimeoutMillis: defaults.poolIdleTimeout,
      reapIntervalMillis: defaults.reapIntervalMillis,
      log: defaults.poolLog,
      create: function(cb) {
        var client = new pools.Client(clientConfig);
        client.connect(function(err) {
          if(err) return cb(err, null);

          //handle connected client background errors by emitting event
          //via the pg object and then removing errored client from the pool
          client.on('error', function(e) {
            pool.emit('error', e, client);
            pool.destroy(client);
          });

          return cb(null, client);
        });
      },
      destroy: function(client) {
        client.end();
      }
    });
    pools.all[name] = pool;
    //mixin EventEmitter to pool
    EventEmitter.call(pool);
    for(var key in EventEmitter.prototype) {
      if(EventEmitter.prototype.hasOwnProperty(key)) {
        pool[key] = EventEmitter.prototype[key];
      }
    }
    //monkey-patch with connect method
    pool.connect = function(cb) {
      pool.acquire(function(err, client) {
        if(err)  return cb(err, null, function() {/*NOOP*/});
        cb(null, client, function(err) {
          if(err) {
            pool.destroy(client);
          } else {
            pool.release(client);
          }
        });
      });
    };
    return pool;
  }
};

module.exports = pools;
