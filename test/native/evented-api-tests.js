var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native").Client;

test('connects', function() {
  var client = new Client("tcp://postgres:1234@127.0.0.1:5432/postgres");
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

