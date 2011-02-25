var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native").Client;
var conString = helper.connectionString();

test('query with non-text as first parameter throws error', function() {
  var client = new Client(conString);
  client.connect();
  assert.emits(client, 'connect', function() {
    var err;
    try{
      client.query({text:{fail: true}});
    } catch(e) {
      err = e;
    }
    assert.ok(err != null, "Expected exception to be thrown")
    client.end();
  })
})
