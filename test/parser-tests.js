require(__dirname+'/test-helper');

var PARSE = function(buffer) {
  return new Parser(buffer).parse();
};

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
    var result = PARSE(authOkBuffer)[0];
    assert.same(result, expectedAuthenticationOkayMessage);
  });

  test('parses ParameterStatus message', function() {
    var result = PARSE(paramStatusBuffer)[0];
    assert.same(result, expectedParameterStatusMessage);
  });

  test('parses BackendKeyData message', function() {
    var result = PARSE(backendKeyDataBuffer)[0];
    assert.same(result, expectedBackendKeyDataMessage);
  });

  test('parses ReadyForQuery message', function() {
    var result = PARSE(readyForQueryBuffer)[0];
    assert.same(result, expectedReadyForQueryMessage);
  });


  var commandCompleteBuffer = new BufferList()
    .addCString("SELECT 3")
    .join(true,'C');

  test('parses CommandComplete message', function() {
    var result = PARSE(commandCompleteBuffer)[0];
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
      var result = PARSE(emptyRowDescriptionBuffer)[0];
      assert.same(result, {
        name: 'RowDescription',
        id: 'T',
        length: 6,
        fieldCount: 0
      });

      assert.equal(result.fields.length, 0);

    });

    var addRow = function(bufferList, name, offset) {
      return bufferList.addCString(name) //field name
        .addInt32(offset++) //table id
        .addInt16(offset++) //attribute of column number
        .addInt32(offset++) //objectId of field's data type
        .addInt16(offset++) //datatype size
        .addInt32(offset++) //type modifier
        .addInt16(0) //format code, 0 => text
    };

    var oneRowDescBuff = new BufferList()
      .addInt16(1);
    oneRowDescBuff = addRow(oneRowDescBuff, 'id', 1)
      .join(true,'T');

    test('parses single row description',function() {
      var result = PARSE(oneRowDescBuff)[0];
      assert.same(result, {
        name: 'RowDescription',
        id: 'T',
        length: 27,
        fieldCount: 1
      });

      assert.equal(result.fields.length, 1);

      assert.same(result.fields[0], {
        name: 'id',
        tableID: 1,
        columnID: 2,
        dataType: 3,
        dataTypeSize: 4,
        dataTypeModifier: 5,
        format: 'text'
      });

    });

    test('parses two row descriptions', function() {
      var twoRowDesc = new BufferList()
        .addInt16(2);
      twoRowDesc = addRow(twoRowDesc, 'bang', 1);
      twoRowDesc = addRow(twoRowDesc, 'whoah', 10);
      twoRowBuf = twoRowDesc.join(true, 'T');

      var result = PARSE(twoRowBuf)[0];
      assert.same(result, {
        name: 'RowDescription',
        id: 'T',
        length: 53,
        fieldCount: 2
      });
      assert.equal(result.fields.length, 2);

      assert.same(result.fields[0], {
        name: 'bang',
        tableID: 1,
        columnID: 2,
        dataType: 3,
        dataTypeSize: 4,
        dataTypeModifier: 5,
        format: 'text'
      });

      assert.same(result.fields[1], {
        name: 'whoah',
        tableID: 10,
        columnID: 11,
        dataType: 12,
        dataTypeSize: 13,
        dataTypeModifier: 14,
        format: 'text'
      });

    });

  });

  test('parses raw data row buffers', function() {

    var emptyRow = new BufferList()
      .addInt16(0)
      .join(true, 'D');

    test('parses empty data row', function() {
      var result = PARSE(emptyRow)[0];
      assert.equal(result.fieldCount, 0);
      assert.equal(result.fields.length, 0);
    });

    var oneField = new BufferList()
      .addInt16(1) //number of fields
      .addInt32(5) //length of bytes of fields
      .addCString('test')
      .join(true, 'D');

    test('parses single field data row', function() {
      var result = PARSE(oneField)[0];
      assert.equal(result.fieldCount, 1);
      assert.equal(result.fields[0], "test\0");
    });

  });

  test('parsing empty buffer returns false', function() {
    var parser = PARSE(Buffer(0));
    assert.equal(parser, false);
  });

});
