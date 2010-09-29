require(__dirname+'/test-helper');
test('Parser on single messages', function() {
  var authOkData = [0x52, 00, 00, 00, 08, 00, 00, 00, 00];
  var authenticationOkBuffer = Buffer(authOkData);

  var firstString = [0x63, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0x5f, 0x65, 0x6e, 0x63, 0x6f, 0x64, 0x69, 0x6e, 0x67, 0];
  var secondString = [0x55, 0x54, 0x46, 0x38, 0];
  var paramStatusData = [0x53, 0, 0, 0, 0x19].concat(firstString).concat(secondString);
  var parameterStatusBuffer = Buffer(paramStatusData);

  var backendKeyData = [0x4b, 0, 0, 0, 0x0c, 0, 0, 0, 1, 0, 0, 0, 2];
  var backendKeyDataBuffer = Buffer(backendKeyData);

  var readyForQueryData = [0x5a, 0, 0, 0, 5, 'I'.charCodeAt(0)];
  var readyForQueryBuffer = Buffer(readyForQueryData)


  var expectedAuthenticationOkayMessage = {
    name: 'AuthenticationOk',
    id: 'R',
    length: 8
  };
  
  var expectedParameterStatusMessage = {
      name: 'ParameterStatus',
      id: 'S',
      length: 25,
      parameterName: 'client_encoding',
      parameterValue: 'UTF8'
  };

  var expectedBackendKeyDataMessage = {
      name: 'BackendKeyData',
      id: 'K',
      processID: 1,
      secretKey: 2
  };

  var expectedReadyForQueryMessage = {
      name: 'ReadyForQuery',
      id: 'Z',
      length: 5,
      status: 'I'
  };

  test('parses AuthenticationOk message', function() {
    var result = new Parser(authenticationOkBuffer).parse()[0];
    assert.same(result, expectedAuthenticationOkayMessage);
  });

  test('parses ParameterStatus message', function() {
    var result = new Parser(parameterStatusBuffer).parse()[0];
    assert.same(result, expectedParameterStatusMessage);
  });

  test('parses BackendKeyData message', function() {
    var result = new Parser(backendKeyDataBuffer).parse()[0];
    assert.same(result, expectedBackendKeyDataMessage);
  });

  test('parses ReadyForQuery message', function() {
    var result = new Parser(readyForQueryBuffer).parse()[0];
    assert.same(result, expectedReadyForQueryMessage);
  });

  test('parses multiple messages', function() {
    var message = authOkData
      .concat(paramStatusData)
      .concat(backendKeyData)
      .concat(readyForQueryData);
    var buffer = Buffer(message);
    var result = new Parser(buffer).parse();
    assert.equal(result.length, 4);
    assert.same(result[0], expectedAuthenticationOkayMessage);
    assert.same(result[1], expectedParameterStatusMessage);
    assert.same(result[2], expectedBackendKeyDataMessage);
    assert.same(result[3], expectedReadyForQueryMessage);
  });

  test('parses normal CString', function() {
    var result = new Parser(Buffer([33,0])).parseCString();
    assert.equal(result,"!");
  });
  
  var resultText = stringToHex("SELECT 3\0");
  var length = resultText.length + 4;
  var commandCompleteData = [0x43, 0, 0, 0, length].concat(resultText);
  
  test('parses CommandComplete message', function() {
    var result = new Parser(Buffer(commandCompleteData)).parse()[0];
    assert.same(result, {
      length: 13,
      id: 'C',
      text: "SELECT 3"
    });
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

  test('parsing empty buffer returns false', function() {
    var parser = new Parser(Buffer(0));
    assert.equal(parser.parse(), false);
  });
});

