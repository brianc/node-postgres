var defaults = require(__dirname + '/defaults');
var genericPool = require('generic-pool');

//takes the same config structure as client
var createPool = function(config) {
  config = config || {};
  var name = JSON.stringify(config);
  var pool = createPool.all[name];
  if(pool) {
    return pool;
  }
  pool = genericPool.Pool({
    name: name,
    max: defaults.poolSize,
    create: function(cb) {
      var client = new createPool.Client(config);
      client.connect(function(err) {
        return cb(err, client);
      });
    },
    destroy: function(client) {
      client.end();
    }
  });
  createPool.all[name] = pool;
  pool.connect = function(cb) {
    pool.acquire(function(err, client) {
      //TODO: on connection error should we remove this client automatically?
      if(err) {
        return cb(err);
      }
      if(cb.length > 2) {
        return newConnect(pool, client, cb);
      }
      return oldConnect(pool, client, cb);
    });
  };
  return pool;
}

//the old connect method of the pool
//would automatically subscribe to the 'drain'
//event and automatically return the client to
//the pool once 'drain' fired once.  This caused
//a bunch of problems, but for backwards compatibility
//we're leaving it in
var alarmDuration = 1000;
var errorMessage = ['A client has been checked out from the pool for longer than ' + alarmDuration + ' ms.',
'You might have a leak!',
'You should use the following new way to check out clients','pg.connect(function(err, client, done)) {',
'  //do something',
'  done();  //call done() to signal you are finished with the client',
'}'].join(require('os').EOL);
var oldConnect = function(pool, client, cb) {
  var tid = setTimeout(function() {
    console.error(errorMessage);
  }, alarmDuration);
  var release = function() {
    clearTimeout(tid);
    pool.release(client);
  };
  client.once('drain', release);
  cb(null, client);
};

var newConnect = function(pool, client, cb) {
  cb(null, client, function() {
    pool.release(client);
  });
};

//list of all created pools
createPool.all = {};

//reference to client constructor
createPool.Client = require(__dirname + '/client');

module.exports = createPool;
