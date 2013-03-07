var EventEmitter = require('events').EventEmitter;

var defaults = require(__dirname + '/defaults');
var genericPool = require('generic-pool');

var deprecate = require('deprecate');

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
        //support both 2 (old) and 3 arguments
        (cb.length > 2 ? newConnect : oldConnect)(pool, client, cb);
      });
    };
    return pool;
  }
};

//the old connect method of the pool
//would automatically subscribe to the 'drain'
//event and automatically return the client to
//the pool once 'drain' fired once.  This caused
//a bunch of problems, but for backwards compatibility
//we're leaving it in
var alarmDuration = 5000;
var errorMessage = [
  'A client has been checked out from the pool for longer than ' + alarmDuration + ' ms.',
  'You might have a leak!',
  'You should use the following new way to check out clients','pg.connect(function(err, client, done)) {',
  '  //do something',
  '  done();  //call done() to signal you are finished with the client',
  '}'
].join(require('os').EOL);

var oldConnect = function(pool, client, cb) {
  deprecate('pg.connect(function(err, client) { ...}) is deprecated and will be removed it v1.0.0 (very soon)',
            'instead, use pg.connect(function(err, client, done) { ... })',
            'automatic releasing of clients back to the pool was a mistake and will be removed',
           'please see the following for more details:',
           'https://github.com/brianc/node-postgres/wiki/pg',
           'https://github.com/brianc/node-postgres/issues/227',
           'https://github.com/brianc/node-postgres/pull/274',
           'feel free to get in touch via github if you have questions');
  var tid = setTimeout(function() {
    console.error(errorMessage);
  }, alarmDuration);
  var onError = function() {
    clearTimeout(tid);
    client.removeListener('drain', release);
  };
  var release = function() {
    clearTimeout(tid);
    pool.release(client);
    client.removeListener('error', onError);
  };
  client.once('drain', release);
  client.once('error', onError);
  cb(null, client);
};

var newConnect = function(pool, client, cb) {
  cb(null, client, function(err) {
    if(err) {
      pool.destroy(client);
    } else {
      pool.release(client);
    }
  });
};

module.exports = pools;
