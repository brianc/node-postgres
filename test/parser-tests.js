require(__dirname+'/test-helper');

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

test('Parser on single messages', function() {

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


  var commandCompleteBuffer = new BufferList()
    .addCString("SELECT 3")
    .join(true,'C');
  test('parses CommandComplete message', function() {
    var result = new Parser(commandCompleteBuffer).parse()[0];
    assert.same(result, {
      length: 13,
      id: 'C',
      text: "SELECT 3"
    });
  });

  var emptyRowDescriptionBuffer = new BufferList()
    .addInt16(0) //number of fields
    .join(true,'T');
  test('parses RowDescriptions', function() {

    test('parses empty row description', function() {
      var result = new Parser(emptyRowDescriptionBuffer).parse()[0];
      assert.same(result, {
        name: 'RowDescription',
        id: 'T',
        length: 6,
        fieldCount: 0
      });
      assert.equal(result.fields.length, 0);
    });

    var oneRowDescBuff = new BufferList()
      .addInt16(1)
      .addCString('id') //field name
      .addInt32(1) //table id
      .addInt16(2) //attribute of column number
      .addInt32(3) //objectId of field's data type
      .addInt16(4) //datatype size
      .addInt32(5) //type modifier
      .addInt32(0) //format code, 0 => text
      .join(true,'T');
    console.log(oneRowDescBuff);
    test('parses single row description',function() {
      var result = new Parser(oneRowDescBuff).parse()[0];
      assert.same(result, {
        name: 'RowDescription',
        id: 'T',
        length: 29,
        fieldCount: 1
      });
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

