var helper = require(__dirname + '/test-helper');
var util = require('util');

test('error during query execution', function() {
  var client = new Client(helper.args);
  client.connect(assert.success(function() {
    var sleepQuery = 'select pg_sleep(5)';
    client.query(sleepQuery, assert.calls(function(err, result) {
      assert(err);
      client.end();
      assert.emits(client, 'end');
    }));
    var client2 = new Client(helper.args);
    client2.connect(assert.success(function() {
var killIdleQuery = "SELECT procpid, (SELECT pg_terminate_backend(procpid)) AS killed FROM pg_stat_activity WHERE current_query = $1";
      client2.query(killIdleQuery, [sleepQuery], assert.calls(function(err, res) {
        assert.ifError(err);
        assert.equal(res.rowCount, 1);
        client2.end();
        assert.emits(client2, 'end');
      }));
    }));
  }));
});
