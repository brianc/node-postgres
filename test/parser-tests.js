require(__dirname+'/test-helper');
test('Parser on single messages', function() {
  test('parses AuthenticationOk message', function() {
    var result = Parser.parse(Buffer([0x52, 00, 00, 00, 08, 00, 00, 00, 00]));
    assert.equal(result.name, 'AuthenticationOk');
    assert.equal(result.id, 'R');
    assert.equal(result.length, 8);
  });


});

