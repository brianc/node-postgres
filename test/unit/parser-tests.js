require(__dirname+'/test-helper');
var buffers = require(__dirname+'/test-buffers');
var PARSE = function(buffer) {
  return new Parser(buffer).parse();
};

var authOkBuffer =  buffers.authenticationOk();
var paramStatusBuffer = buffers.parameterStatus('client_encoding', 'UTF8');
var readyForQueryBuffer = buffers.readyForQuery();
var backendKeyDataBuffer = buffers.backendKeyData(1,2);
var commandCompleteBuffer = buffers.commandComplete("SELECT 3");

var addRow = function(bufferList, name, offset) {
  return bufferList.addCString(name) //field name
    .addInt32(offset++) //table id
    .addInt16(offset++) //attribute of column number
    .addInt32(offset++) //objectId of field's data type
    .addInt16(offset++) //datatype size
    .addInt32(offset++) //type modifier
    .addInt16(0) //format code, 0 => text
};

var row1 = {
  name: 'id',
  tableID: 1,
  attributeNumber: 2,
  dataTypeID: 3,
  dataTypeSize: 4,
  typeModifier: 5,
  formatCode: 0
};
var oneRowDescBuff = new buffers.rowDescription([row1]);
row1.name = 'bang';

var twoRowBuf = new buffers.rowDescription([row1,{
  name: 'whoah',
  tableID: 10,
  attributeNumber: 11,
  dataTypeID: 12,
  dataTypeSize: 13,
  typeModifier: 14,
  formatCode: 0
}])


var emptyRowFieldBuf = new BufferList()
  .addInt16(0)
  .join(true, 'D');

var emptyRowFieldBuf = buffers.dataRow();

var oneFieldBuf = new BufferList()
  .addInt16(1) //number of fields
  .addInt32(5) //length of bytes of fields
  .addCString('test')
  .join(true, 'D');

var oneFieldBuf = buffers.dataRow(['test\0']);


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

var expectedCommandCompleteMessage = {
  length: 13,
  id: 'C',
  text: "SELECT 3"
};
var emptyRowDescriptionBuffer = new BufferList()
  .addInt16(0) //number of fields
  .join(true,'T');

var expectedEmptyRowDescriptionMessage = {
  name: 'RowDescription',
  id: 'T',
  length: 6,
  fieldCount: 0
};
var expectedOneRowMessage = {
  name: 'RowDescription',
  id: 'T',
  length: 27,
  fieldCount: 1
};

var expectedTwoRowMessage = {
  name: 'RowDescription',
  id: 'T',
  length: 53,
  fieldCount: 2
};

var testForMessage = function(buffer, expectedMessage) {
  var lastMessage = {};
  test('recieves and parses ' + expectedMessage.name, function() {
    var stream = new MemoryStream();
    var client = new Client({
      stream: stream
    });
    client.connect();

    client.on('message',function(msg) {
      lastMessage = msg;
    });
    stream.emit('data', buffer);
    assert.same(lastMessage, expectedMessage);
  });
  return lastMessage;
};

test('Client', function() {
  testForMessage(authOkBuffer, expectedAuthenticationOkayMessage);
  testForMessage(paramStatusBuffer, expectedParameterStatusMessage);
  testForMessage(backendKeyDataBuffer, expectedBackendKeyDataMessage);
  testForMessage(readyForQueryBuffer, expectedReadyForQueryMessage);
  testForMessage(commandCompleteBuffer,expectedCommandCompleteMessage);
  test('empty row message', function() {
    var message = testForMessage(emptyRowDescriptionBuffer, expectedEmptyRowDescriptionMessage);
    test('has no fields', function() {
      assert.equal(message.fields.length, 0);
    });
  });

  test('one row message', function() {
    var message = testForMessage(oneRowDescBuff, expectedOneRowMessage);
    test('has one field', function() {
      assert.equal(message.fields.length, 1);
    });
    test('has correct field info', function() {
      assert.same(message.fields[0], {
        name: 'id',
        tableID: 1,
        columnID: 2,
        dataType: 3,
        dataTypeSize: 4,
        dataTypeModifier: 5,
        format: 'text'
      });
    });
  });

  test('two row message', function() {
    var message = testForMessage(twoRowBuf, expectedTwoRowMessage);
    test('has two fields', function() {
      assert.equal(message.fields.length, 2);
    });
    test('has correct first field', function() {
      assert.same(message.fields[0], {
        name: 'bang',
        tableID: 1,
        columnID: 2,
        dataType: 3,
        dataTypeSize: 4,
        dataTypeModifier: 5,
        format: 'text'
      })
    });
    test('has correct second field', function() {
      assert.same(message.fields[1], {
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

  test('parsing rows', function() {

    test('parsing empty row', function() {
      var message = testForMessage(emptyRowFieldBuf, {
        name: 'DataRow',
        fieldCount: 0
      });
      test('has 0 fields', function() {
        assert.equal(message.fields.length, 0);
      });
    });

    test('parsing data row with fields', function() {
      var message = testForMessage(oneFieldBuf, {
        name: 'DataRow',
        fieldCount: 1
      });
      test('has 1 field', function() {
        assert.equal(message.fields.length, 1);
      });

      test('field is correct', function() {
        assert.equal(message.fields[0],'test\0');
      });
    });

  });

  test('error messages', function() {
    test('with no fields', function() {
      var msg = testForMessage(buffers.error(),{
        name: 'Error'
      });
    });

    test('with all the fields', function() {
      var buffer = buffers.error([{
        type: 'S',
        value: 'ERROR'
      },{
        type: 'C',
        value: 'code'
      },{
        type: 'M',
        value: 'message'
      },{
        type: 'D',
        value: 'details'
      },{
        type: 'H',
        value: 'hint'
      },{
        type: 'P',
        value: '100'
      },{
        type: 'p',
        value: '101'
      },{
        type: 'q',
        value: 'query'
      },{
        type: 'W',
        value: 'where'
      },{
        type: 'F',
        value: 'file'
      },{
        type: 'L',
        value: 'line'
      },{
        type: 'R',
        value: 'routine'
      },{
        type: 'Z', //ignored
        value: 'alsdkf'
      }]);

      testForMessage(buffer,{
        severity: 'ERROR',
        code: 'code',
        message: 'message',
        detail: 'details',
        hint: 'hint',
        position: '100',
        internalPosition: '101',
        internalQuery: 'query',
        where: 'where',
        file: 'file',
        line: 'line',
        routine: 'routine'
      });
    });


  });
});


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

  test('parses CommandComplete message', function() {
    var result = PARSE(commandCompleteBuffer)[0];
    assert.same(result, expectedCommandCompleteMessage);
  });

  test('parses RowDescriptions', function() {

    test('parses empty row description', function() {
      var result = PARSE(emptyRowDescriptionBuffer)[0];
      assert.same(result, expectedEmptyRowDescriptionMessage);
      assert.equal(result.fields.length, 0);
    });


    test('parses single row description',function() {
      var result = PARSE(oneRowDescBuff)[0];
      assert.same(result, expectedOneRowMessage);

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

      var result = PARSE(twoRowBuf)[0];
      assert.same(result, expectedTwoRowMessage);
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

    var emptyRowFieldBuf = new BufferList()
      .addInt16(0)
      .join(true, 'D');

    test('parses empty data row', function() {
      var result = PARSE(emptyRowFieldBuf)[0];
      assert.equal(result.fieldCount, 0);
      assert.equal(result.fields.length, 0);
    });

    var oneFieldBuf = new BufferList()
      .addInt16(1) //number of fields
      .addInt32(5) //length of bytes of fields
      .addCString('test')
      .join(true, 'D');

    test('parses single field data row', function() {
      var result = PARSE(oneFieldBuf)[0];
      assert.equal(result.fieldCount, 1);
      assert.equal(result.fields[0], "test\0");
    });

  });

  test('parsing empty buffer returns false', function() {
    var parser = PARSE(Buffer(0));
    assert.equal(parser, false);
  });

});

