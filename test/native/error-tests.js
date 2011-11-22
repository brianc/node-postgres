var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native");

test('query with non-text as first parameter throws error', function() {
  var client = new Client(helper.config);
  client.connect();
  assert.emits(client, 'connect', function() {
    assert.throws(function() {
      client.query({text:{fail: true}});
    })
    client.end();
  })
})

test('parameterized query with non-text as first parameter throws error', function() {
  var client = new Client(helper.config);
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

var connect = function(callback) {
  var client = new Client(helper.config);
  client.connect();
  assert.emits(client, 'connect', function() {
    callback(client);
  })
}

test('parameterized query with non-array for second value', function() {
  test('inline', function() {
    connect(function(client) {
      assert.throws(function() {
        client.query("SELECT *", "LKSDJF")
      })
      client.end();
    })
  })

  test('config', function() {
    connect(function(client) {
      assert.throws(function() {
        client.query({
          text: "SELECT *",
          values: "ALSDKFJ"
        })
      })
      client.end();
    })
  })
})


