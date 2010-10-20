require(__dirname+'/test-helper');

test('password authentication', function(){

  var client = createClient();
  client.password = "!";

  var clearTextPasswordBuffer = Buffer([0x52, 0, 0, 0, 8, 0, 0, 0, 3]);

  var raised = false;

  client.on('authenticationCleartextPassword', function() {
    raised = true;
  });

  client.stream.emit('data', clearTextPasswordBuffer);

  test('raises event', function() {
    assert.ok(raised);
  });

  test('responds with password', function() {
    assert.length(client.stream.packets, 1);
    var packet = client.stream.packets[0];
    assert.equalBuffers(packet, [0x70, 0, 0, 0, 6, 33, 0]);
  });

});
