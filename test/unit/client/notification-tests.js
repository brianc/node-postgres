var helper = require(__dirname + "/test-helper");
test('passes connection notification', function() {
  var client = new Client();
  assert.emits(client, 'notify', function(msg) {
    assert.equal(msg, "HAY!!");
  })
  client.connection.emit('notify', "HAY!!");
})

