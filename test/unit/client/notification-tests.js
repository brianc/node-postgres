var helper = require(__dirname + "/test-helper");
test('passes connection notification', function() {
  var client = new Client();
  assert.emits(client, 'notification', function(msg) {
    assert.equal(msg, "HAY!!");
  })
  client.connection.emit('notification', "HAY!!");
})

