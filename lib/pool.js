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
      max: clientConfig.poolSize || defaults.poolSize,
      idleTimeoutMillis: clientConfig.poolIdleTimeout || defaults.poolIdleTimeout,
      reapIntervalMillis: clientConfig.reapIntervalMillis || defaults.reapIntervalMillis,
      log: clientConfig.poolLog || defaults.poolLog,
      create: function(cb) {
        var client = new pools.Client(clientConfig);
        client.connect(function(err) {
          if(err) return cb(err, null);

          //handle connected client background errors by emitting event
          //via the pg object and then removing errored client from the pool
          client.on('error', function(e) {
            pool.emit('error', e, client);

            // If the client is already being destroyed, the error
            // occurred during stream ending. Do not attempt to destroy
            // the client again.
            if (!client._destroying) {
              pool.destroy(client);
            }
          });

          // Remove connection from pool on disconnect
          client.on('end', function(e) {
            // Do not enter infinite loop between pool.destroy
            // and client 'end' event...
            if ( ! client._destroying ) {
              pool.destroy(client);
            }
          });
          client.poolCount = 0;
          return cb(null, client);
        });
      },
      destroy: function(client) {
        client._destroying = true;
        client.poolCount = undefined;
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
      var domain = process.domain;
      pool.acquire(function(err, client) {
        if(domain) {
          cb = domain.bind(cb);
        }
        if(err)  return cb(err, null, function() {/*NOOP*/});
        client.poolCount++;
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
