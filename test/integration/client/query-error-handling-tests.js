var helper = require(__dirname + '/test-helper');
var util = require('util');

test('error during query execution', function() {
  var client = new Client(helper.args);
  client.connect(assert.success(function() {
    var sleepQuery = 'select pg_sleep(5)';
    var pidColName = 'procpid'
    var queryColName = 'current_query';
    helper.versionGTE(client, '9.2.0', assert.success(function(isGreater) {
      if(isGreater) {
        pidColName = 'pid';
        queryColName = 'query';
      }
      var query1 = client.query(sleepQuery, assert.calls(function(err, result) {
        assert(err);
        client.end();
      }));
      //ensure query1 does not emit an 'end' event
      //because it was killed and received an error
      //https://github.com/brianc/node-postgres/issues/547
      query1.on('end', function() {
        assert.fail('Query with an error should not emit "end" event')
      })
      var client2 = new Client(helper.args);
      client2.connect(assert.success(function() {
        var killIdleQuery = "SELECT " + pidColName + ", (SELECT pg_terminate_backend(" + pidColName + ")) AS killed FROM pg_stat_activity WHERE " + queryColName + " = $1";
        client2.query(killIdleQuery, [sleepQuery], assert.calls(function(err, res) {
          assert.ifError(err);
          assert.equal(res.rows.length, 1);
          client2.end();
          assert.emits(client2, 'end');
        }));
      }));
    }));
  }));
});
