var helper = require(__dirname + "/test-helper");
test('passes connection notification', function() {
  var client = helper.client();
  assert.emits(client, 'notice', function(msg) {
    assert.equal(msg, "HAY!!");
  })
  client.connection.emit('notice', "HAY!!");
})

