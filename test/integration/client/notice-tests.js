var helper = require(__dirname + '/test-helper');
test('emits notice message', function() {
  var client = helper.client();

  client.query('create temp table boom(id serial, size integer)');

  assert.emits(client, 'notice', function(notice) {
    assert.ok(notice != null);
    client.end();
  });
})
