var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native").Client;
var conString = "tcp://postgres:1234@127.0.0.1:5432/postgres";
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

test('multiple results', function() {
  var client = new Client(conString);
  client.connect();
  test('queued queries', function() {
    client.query("CREATE TEMP TABLE boom(name varchar(10))");
    client.query("INSERT INTO boom(name) VALUES('Aaron')");
    client.query("INSERT INTO boom(name) VALUES('Brian')");
    var q = client.query("SELECT * from BOOM");
    assert.emits(q, 'row', function(row) {
      assert.equal(row.name, 'Aaron');
      assert.emits(q, 'row', function(row) {
        assert.equal(row.name, "Brian");
        client.end();
      })
    })
  })
})
