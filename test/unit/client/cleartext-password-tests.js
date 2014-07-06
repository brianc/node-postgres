require(__dirname+'/test-helper');

/*
 * TODO: Add _some_ comments to explain what it is we're testing, and how the
 * code-being-tested works behind the scenes.
 */

test('cleartext password authentication', function(){

  var client = createClient();
  client.password = "!";
  client.connection.stream.packets = [];
  client.connection.emit('authenticationCleartextPassword');
  test('responds with password', function() {
    var packets = client.connection.stream.packets;
    assert.lengthIs(packets, 1);
    var packet = packets[0];
    assert.equalBuffers(packet, [0x70, 0, 0, 0, 6, 33, 0]);
  });

});
