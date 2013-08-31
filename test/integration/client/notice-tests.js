var helper = require(__dirname + '/test-helper');
test('emits notice message', function() {
  //TODO this doesn't work on all versions of postgres
  return false;
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
      assert.emits(client, 'notification', function(msg) {
        //make sure PQfreemem doesn't invalidate string pointers
        setTimeout(function() {
          assert.equal(msg.channel, 'boom');
          assert.ok(msg.payload == 'omg!' /*9.x*/ || msg.payload == '' /*8.x*/, "expected blank payload or correct payload but got " + msg.message)
          client.end()
        }, 100)

      });
      assert.emits(otherClient, 'notification', function(msg) {
        assert.equal(msg.channel, 'boom');
        otherClient.end();
      });

      client.query("NOTIFY boom, 'omg!'", function(err, q) {
        if(err) {
          //notify not supported with payload on 8.x
          client.query("NOTIFY boom")
        }
      });
    }));
  }));
})

