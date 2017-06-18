"use strict";
var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native");


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
      client.end();
      assert.emits(client, 'end', function() {
        assert.throws(function() {
          client.query("SELECT *", "LKSDJF")
        });
      });
    });
  });

  test('config', function() {
    connect(function(client) {
      client.end();
      assert.emits(client, 'end', function() {
        assert.throws(function() {
          client.query({
            text: "SELECT *",
            values: "ALSDKFJ"
          });
        });
      });
    });
  });
});


