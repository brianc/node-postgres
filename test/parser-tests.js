require(__dirname+'/test-helper');



test('Parser on single messages', function() {

  var authOkBuffer = new BufferList()
    .addInt32(8)
    .join(true, 'R');


  var paramStatusBuffer = new BufferList()
    .addCString("client_encoding")
    .addCString("UTF8")
    .join(true, 'S');

  var backendKeyDataBuffer = new BufferList()
    .addInt32(1)
    .addInt32(2)
    .join(true,'K');



  var readyForQueryBuffer = new BufferList()
    .add(Buffer('I'))
    .join(true,'Z');

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
    var result = new Parser(authOkBuffer).parse()[0];
    assert.same(result, expectedAuthenticationOkayMessage);
  });

  test('parses ParameterStatus message', function() {
    var result = new Parser(paramStatusBuffer).parse()[0];
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

  var packet = {
    BYTE: 'T',
    LENGTH: null,
    INT16: 0
  };

  var x = [0x54, 0, 0, 0, 26, 0, 1, 33, 0, 0, 0, 0, 2, 0, 3, 0, 0, 0, 4, 0, 5, 0, 6, 0, 0];
  test('parses RowDescriptions', function() {

    test('parses empty row description', function() {
      var buffer = Buffer([0x54, 0, 0, 0, 6, 0, 0]);
      var result = new Parser(buffer).parse()[0];
      assert.same(result, {
        name: 'RowDescription',
        id: 'T',
        length: 6,
        rowCount: 0
      });
      assert.equal(result.rows.length, 0);
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

