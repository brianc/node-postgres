var helper = require(__dirname + '/test-helper');
var util = require('util');
var PgTypes = require('pg-types');

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

test('parseRow error during query execution of prepared statement', function() {
  PgTypes.setTypeParser(23, 'text', function () {
    throw new Error("Type Parser Error")
  });
  var client = new Client(helper.args);
  client.connect(assert.success(function() {
    var query1 = client.query('SELECT $1::int', ['1'], assert.calls(function(err, result) {
      PgTypes.setTypeParser(23, 'text', null);
      assert(err);
    }));
    // ensure query does not emit an 'end' event since error was thrown
    query1.on('end', function() {
      PgTypes.setTypeParser(23, 'text', null);
      assert.fail('Query with an error should not emit "end" event');
    });
    client.end();
  }));
});
