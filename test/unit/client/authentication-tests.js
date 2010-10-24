
require(__dirname+'/test-helper');

test('password authentication', function(){

  var client = createClient();
  client.password = "!";

  client.connection.emit('authenticationCleartextPassword');
  test('responds with password', function() {
    assert.length(client.stream.packets, 1);
    var packet = client.stream.packets[0];
    assert.equalBuffers(packet, [0x70, 0, 0, 0, 6, 33, 0]);
  });

});

test('md5 authentication', function() {
  var client = createClient();
  client.password = "!";

  var md5PasswordBuffer = Buffer([0x52, 0, 0, 0, 12, 0, 0, 0, 5, 1, 2, 3, 4]);

  var raised = false;

  client.on('authenticationMD5Password', function(msg) {
    raised = true;
    assert.equalBuffers(msg.salt, new Buffer([1,2,3,4]));
  });

  client.stream.emit('data', md5PasswordBuffer);

  test('raises event', function() {
    assert.ok(raised);
  });

  test('responds', function() {
    assert.length(client.stream.packets, 1);
    test('should have correct encrypted data', function() {
      //how do we want to test this?
      return false;
    });
  });

});
