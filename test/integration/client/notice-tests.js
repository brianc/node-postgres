var helper = require(__dirname + '/test-helper');
test('emits notice message', function() {
  var client = helper.client();
  client.query('create temp table boom(id serial, size integer)');
  assert.emits(client, 'notice', function(notice) {
    assert.ok(notice != null);
    //TODO ending connection after notice generates weird errors
    process.nextTick(function() {
      client.end();
    })
  });
})

test('emits notify message', function() {
  var client = helper.client();
  client.query('LISTEN boom', assert.calls(function() {
    var otherClient = helper.client();
    otherClient.query('LISTEN boom', assert.calls(function() {
      client.query('NOTIFY boom');
      assert.emits(client, 'notification', function(msg) {
        assert.equal(msg.channel, 'boom');
        client.end()
      });
      assert.emits(otherClient, 'notification', function(msg) {
        assert.equal(msg.channel, 'boom');
        otherClient.end();
      });
    }));
  }));
})

