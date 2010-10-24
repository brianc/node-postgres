require(__dirname+'/test-helper');

test('cleartext password authentication', function(){

  var client = createClient();
  client.password = "!";
  client.stream.packets = [];
  client.connection.emit('authenticationCleartextPassword');
  test('responds with password', function() {
    assert.length(client.stream.packets, 1);
    var packet = client.stream.packets[0];
    assert.equalBuffers(packet, [0x70, 0, 0, 0, 6, 33, 0]);
  });

});
