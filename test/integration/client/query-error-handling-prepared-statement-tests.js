var helper = require(__dirname + '/test-helper');
var util = require('util');

function killIdleQuery(targetQuery) {
  var client2 = new Client(helper.args);
  var pidColName = 'procpid'
  var queryColName = 'current_query';
  client2.connect(assert.success(function() {
    helper.versionGTE(client2, '9.2.0', assert.success(function(isGreater) {
      if(isGreater) {
        pidColName = 'pid';
        queryColName = 'query';
      }
      var killIdleQuery = "SELECT " + pidColName + ", (SELECT pg_terminate_backend(" + pidColName + ")) AS killed FROM pg_stat_activity WHERE " + queryColName + " = $1";
      client2.query(killIdleQuery, [targetQuery], assert.calls(function(err, res) {
        assert.ifError(err);
        assert.equal(res.rows.length, 1);
        client2.end();
        assert.emits(client2, 'end');
      }));
    }));
  }));
}

test('query killed during query execution of prepared statement', function() {
  if(helper.args.native) {
    return false;
  }
  var client = new Client(helper.args);
  client.connect(assert.success(function() {
    var sleepQuery = 'select pg_sleep($1)';
    var query1 = client.query({
      name: 'sleep query',
      text: sleepQuery,
      values: [5] },
      assert.calls(function(err, result) {
        assert.equal(err.message, 'terminating connection due to administrator command');
    }));

    query1.on('error', function(err) {
      assert.fail('Prepared statement should not emit error');
    });

    query1.on('row', function(row) {
      assert.fail('Prepared statement should not emit row');
    });

    query1.on('end', function(err) {
      assert.fail('Prepared statement when executed should not return before being killed');
    });

    killIdleQuery(sleepQuery);
  }));
});


test('client end during query execution of prepared statement', function() {
  var client = new Client(helper.args);
  client.connect(assert.success(function() {
    var sleepQuery = 'select pg_sleep($1)';
    var query1 = client.query({
      name: 'sleep query',
      text: sleepQuery,
      values: [5] },
      assert.calls(function(err, result) {
        assert.equal(err.message, 'Connection terminated');
    }));

    query1.on('error', function(err) {
      assert.fail('Prepared statement should not emit error');
    });

    query1.on('row', function(row) {
      assert.fail('Prepared statement should not emit row');
    });

    query1.on('end', function(err) {
      assert.fail('Prepared statement when executed should not return before being killed');
    });

    client.end();
  }));
});
