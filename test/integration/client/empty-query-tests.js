var helper = require(__dirname+'/test-helper');
var client = helper.client();

test("empty query message handling", function() {
  assert.emits(client, 'drain', function() {
    client.end();
  });
  client.query("");
});
