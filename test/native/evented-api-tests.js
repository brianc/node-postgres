var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native").Client;
var conString = helper.connectionString();
test('connects', function() {
  var client = new Client(conString);
  client.connect();
  test('good query', function() {
    var query = client.query("SELECT 1 as num, 'HELLO' as str");
    assert.emits(query, 'row', function(row) {
      test('has integer data type', function() {
        assert.strictEqual(row.num, 1);
      })
      test('has string data type', function() {
        assert.strictEqual(row.str, "HELLO")
      })
      test('emits end AFTER row event', function() {
        assert.emits(query, 'end');
        test('error query', function() {
          var query = client.query("LSKDJF");
          assert.emits(query, 'error', function(err) {
            assert.ok(err != null, "Should not have emitted null error");
            client.end();
          })
        })
      })
    })
  })
})
var setupClient = function() {
  var client = new Client(conString);
  client.connect();
  client.query("CREATE TEMP TABLE boom(name varchar(10))");
  client.query("INSERT INTO boom(name) VALUES('Aaron')");
  client.query("INSERT INTO boom(name) VALUES('Brian')");
  return client;
}

test('multiple results', function() {
  test('queued queries', function() {
    var client = setupClient();
    var q = client.query("SELECT name FROM BOOM");
    assert.emits(q, 'row', function(row) {
      assert.equal(row.name, 'Aaron');
      assert.emits(q, 'row', function(row) {
        assert.equal(row.name, "Brian");
      })
    })
    assert.emits(q, 'end', function() {
      test('query with config', function() {
        var q = client.query({text:'SELECT 1 as num'});
        assert.emits(q, 'row', function(row) {
          assert.strictEqual(row.num, 1);
          assert.emits(q, 'end', function() {
            client.end();
          })
        })
      })
    })
  })
})

test('parameterized queries', function() {
  test('with a single string param', function() {
    var client = setupClient();
    var q = client.query("SELECT * FROM boom WHERE name = $1", ['Aaron']);
    assert.emits(q, 'row', function(row) {
      assert.equal(row.name, 'Aaron');
    })
    assert.emits(q, 'end', function() {
      client.end();
    });
  })

  test('with object config for query', function() {
    var client = setupClient();
    var q = client.query({
      text: "SELECT name FROM boom WHERE name = $1",
      values: ['Brian']
    });
    assert.emits(q, 'row', function(row) {
      assert.equal(row.name, 'Brian');
    })
    assert.emits(q, 'end', function() {
      client.end();
    })
  })

})

