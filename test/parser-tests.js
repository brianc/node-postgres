require(__dirname+'/test-helper');
test('Parser on single messages', function() {
  test('parses AuthenticationOk message', function() {
    var result = Parser.parse(Buffer([0x52, 00, 00, 00, 08, 00, 00, 00, 00]));
    assert.equal(result.name, 'AuthenticationOk');
    assert.equal(result.id, 'R');
    assert.equal(result.length, 8);
  });

  test('parses ParameterStatus message', function() {
    var firstString = [0x63, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0x5f, 0x65, 0x6e, 0x63, 0x6f, 0x64, 0x69, 0x6e, 0x67, 0];
    var secondString = [0x55, 0x54, 0x46, 0x38, 0];
    var bytes = [53, 0, 0, 0, 0x19].concat(firstString).concat(secondString);
    var result = Parser.parse(Buffer(bytes));

  });
});

