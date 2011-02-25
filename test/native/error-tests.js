var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native").Client;
var conString = helper.connectionString();

test('query with non-text as first parameter throws error', function() {
  var client = new Client(conString);
  client.connect();
  assert.emits(client, 'connect', function() {
    assert.throws(function() {
      client.query({text:{fail: true}});
    })
    client.end();
  })
})

test('parameterized query with non-text as first parameter throws error', function() {
  var client = new Client(conString);
  client.connect();
  assert.emits(client, 'connect', function() {
    assert.throws(function() {
      client.query({
        text: {fail: true},
        values: [1, 2]
      })
    })
    client.end();
  })
})

