var helper = require(__dirname + "/../test-helper");
var pg = require(__dirname + "/../../../lib");
var async = require('async');

// Creates a pooled connnection and returns it's backend PID
// The pooled connection will remain in the pool for 30-seconds (default).
function getBackendPid(cb) {
  pg.connect(helper.config, function(err, client, done) {
    if (err) return cb(err);
    client.query('SELECT pg_backend_pid() AS pid', function(err, result) {
      done(err);
      if (err) return cb(err);
      return cb(null, result.rows[0].pid);
    });
  });
}

// Create a new non-pooled connection and use it to terminate a backend.
function terminateBackend(pid, cb) {
  var client = helper.client();
  client.query('SELECT pg_terminate_backend($1)', [pid], function(err, result) {
    client.end();
    return cb(err);
  });
}

async.waterfall([
  getBackendPid,
  terminateBackend
], function(err, results) {
  assert.ok(!err);
  pg.end();
});
