var helper = require(__dirname + '/test-helper');
test('emits notice message', function() {
  var client = helper.client();
  client.query('create temp table boom(id serial, size integer)');
  assert.emits(client, 'notice', function(notice) {
    assert.ok(notice != null);
    client.end();
  });
})

test('emits notify message', function() {
  var client = helper.client();
  client.query('LISTEN boom', assert.calls(function() {
    var otherClient = helper.client();
    otherClient.query('LISTEN boom', assert.calls(function() {
      client.query('NOTIFY boom');
      assert.emits(client, 'notification', function(msg) {
        client.end()
      });
      assert.emits(otherClient, 'notification', function(msg) {
        otherClient.end();
      });
    }));
  }));
})

