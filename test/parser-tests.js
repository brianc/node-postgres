require(__dirname+'/test-helper');
test('Parser on single messages', function() {
  test('parses AuthenticationOk message', function() {
    var buffer = Buffer([0x52, 00, 00, 00, 08, 00, 00, 00, 00]);
    var result = new Parser(buffer).parse();
    assert.equal(result.name, 'AuthenticationOk');
    assert.equal(result.id, 'R');
    assert.equal(result.length, 8);
  });

  test('parses ParameterStatus message', function() {
    var firstString = [0x63, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0x5f, 0x65, 0x6e, 0x63, 0x6f, 0x64, 0x69, 0x6e, 0x67, 0];
    var secondString = [0x55, 0x54, 0x46, 0x38, 0];
    var bytes = [0x53, 0, 0, 0, 0x19].concat(firstString).concat(secondString);
    var buffer = Buffer(bytes);
    var result = new Parser(buffer).parse();
    assert.equal(result.name, 'ParameterStatus');
    assert.equal(result.id, 'S');
    assert.equal(result.length, 25);
    assert.equal(result.parameterName, "client_encoding");
    assert.equal(result.parameterValue, "UTF8");
  });

  test('parses normal CString', function() {
    var result = new Parser(Buffer([33,0])).parseCString();
    assert.equal(result,"!");
  });

  test('parses empty CString', function() {
    var result = new Parser(Buffer([0])).parseCString();
    assert.equal(result, '');
  });

  test('parses length', function() {
    var parser = new Parser(Buffer([0,0,0,3]));
    var result = parser.parseLength();
    assert.equal(result, 3);
    assert.equal(parser.offset, 4);
  });
});

