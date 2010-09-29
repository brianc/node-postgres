require(__dirname+'/test-helper');
test('Parser on single messages', function() {
  test('parses AuthenticationOk message', function() {
    var result = new Parser().parse(Buffer([0x52, 00, 00, 00, 08, 00, 00, 00, 00]));
    assert.equal(result.name, 'AuthenticationOk');
    assert.equal(result.id, 'R');
    assert.equal(result.length, 8);
  });

  test('parses ParameterStatus message', function() {
    var firstString = [0x63, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0x5f, 0x65, 0x6e, 0x63, 0x6f, 0x64, 0x69, 0x6e, 0x67, 0];
    var secondString = [0x55, 0x54, 0x46, 0x38, 0];
    var bytes = [0x53, 0, 0, 0, 0x19].concat(firstString).concat(secondString);
    var result = new Parser().parse(Buffer(bytes));
    assert.equal(result.name, 'ParameterStatus');
    assert.equal(result.id, 'S');
    assert.equal(result.length, 25);
    assert.equal(result.parameterName, "client_encoding");
    assert.equal(result.parameterValue, "UTF8");
  });

  test('parses normal CString', function() {
    var result = new Parser().parseCString(Buffer([33,00]));
    assert.equal(result,"!");
  });

  test('parses empty CString', function() {
    var result = new Parser().parseCString(Buffer([0]));
    assert.equal(result, '');
  });
});

