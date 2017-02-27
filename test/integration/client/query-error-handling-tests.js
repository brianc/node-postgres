var helper = require(__dirname + '/test-helper');
var util = require('util');
var PgTypes = require('pg-types');

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
      setTimeout(function() {
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
      }, 100)
    }));
  }));
});

test('parseRow error is handled', function() {
  PgTypes.setTypeParser(23, 'text', function () {
    throw new Error("Type Parser Error")
  });
  var client = new Client(helper.args);
  client.connect(assert.success(function() {
    var query1 = client.query('SELECT 1', assert.calls(function(err, result) {
      PgTypes.setTypeParser(23, 'text', null);
      assert(err);
      return client.end();
    }));
    // ensure query does not emit an 'end' event since error was thrown
    query1.on('end', function() {
      PgTypes.setTypeParser(23, 'text', null);
      assert.fail('Query with an error should not emit "end" event');
    });
  }));
});

if(helper.config.native) return;

test('9.3 column error fields', function() {
  var client = new Client(helper.args);
  client.connect(assert.success(function() {
    helper.versionGTE(client, '9.3.0', assert.success(function(isGreater) {
      if(!isGreater) {
        return client.end();
      }

      client.query('DROP TABLE IF EXISTS column_err_test');
      client.query('CREATE TABLE column_err_test(a int NOT NULL)');
      client.query('INSERT INTO column_err_test(a) VALUES (NULL)', function (err) {
        assert.equal(err.severity, 'ERROR');
        assert.equal(err.code, '23502');
        assert.equal(err.schema, 'public');
        assert.equal(err.table, 'column_err_test');
        assert.equal(err.column, 'a');
        return client.end();
      });
    }));
  }));
});

test('9.3 constraint error fields', function() {
  var client = new Client(helper.args);
  client.connect(assert.success(function() {
    helper.versionGTE(client, '9.3.0', assert.success(function(isGreater) {
      if(!isGreater) {
        console.log('skip 9.3 error field on older versions of postgres');
        return client.end();
      }

      client.query('DROP TABLE IF EXISTS constraint_err_test');
      client.query('CREATE TABLE constraint_err_test(a int PRIMARY KEY)');
      client.query('INSERT INTO constraint_err_test(a) VALUES (1)');
      client.query('INSERT INTO constraint_err_test(a) VALUES (1)', function (err) {
        assert.equal(err.severity, 'ERROR');
        assert.equal(err.code, '23505');
        assert.equal(err.schema, 'public');
        assert.equal(err.table, 'constraint_err_test');
        assert.equal(err.constraint, 'constraint_err_test_pkey');
        return client.end();
      });
    }));
  }));
});
