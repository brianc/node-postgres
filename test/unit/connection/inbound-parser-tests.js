'use strict'
require(__dirname + '/test-helper')
var Connection = require(__dirname + '/../../../lib/connection')
var buffers = require(__dirname + '/../../test-buffers')
var PARSE = function (buffer) {
  return new Parser(buffer).parse()
}

var authOkBuffer = buffers.authenticationOk()
var paramStatusBuffer = buffers.parameterStatus('client_encoding', 'UTF8')
var readyForQueryBuffer = buffers.readyForQuery()
var backendKeyDataBuffer = buffers.backendKeyData(1, 2)
var commandCompleteBuffer = buffers.commandComplete('SELECT 3')
var parseCompleteBuffer = buffers.parseComplete()
var bindCompleteBuffer = buffers.bindComplete()
var portalSuspendedBuffer = buffers.portalSuspended()

var addRow = function (bufferList, name, offset) {
  return bufferList.addCString(name) // field name
    .addInt32(offset++) // table id
    .addInt16(offset++) // attribute of column number
    .addInt32(offset++) // objectId of field's data type
    .addInt16(offset++) // datatype size
    .addInt32(offset++) // type modifier
    .addInt16(0) // format code, 0 => text
}

var row1 = {
  name: 'id',
  tableID: 1,
  attributeNumber: 2,
  dataTypeID: 3,
  dataTypeSize: 4,
  typeModifier: 5,
  formatCode: 0
}
var oneRowDescBuff = new buffers.rowDescription([row1])
row1.name = 'bang'

var twoRowBuf = new buffers.rowDescription([row1, {
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
  .join(true, 'D')

var emptyRowFieldBuf = buffers.dataRow()

var oneFieldBuf = new BufferList()
  .addInt16(1) // number of fields
  .addInt32(5) // length of bytes of fields
  .addCString('test')
  .join(true, 'D')

var oneFieldBuf = buffers.dataRow(['test'])

var expectedAuthenticationOkayMessage = {
  name: 'authenticationOk',
  length: 8
}

var expectedParameterStatusMessage = {
  name: 'parameterStatus',
  parameterName: 'client_encoding',
  parameterValue: 'UTF8',
  length: 25
}

var expectedBackendKeyDataMessage = {
  name: 'backendKeyData',
  processID: 1,
  secretKey: 2
}

var expectedReadyForQueryMessage = {
  name: 'readyForQuery',
  length: 5,
  status: 'I'
}

var expectedCommandCompleteMessage = {
  length: 13,
  text: 'SELECT 3'
}
var emptyRowDescriptionBuffer = new BufferList()
  .addInt16(0) // number of fields
  .join(true, 'T')

var expectedEmptyRowDescriptionMessage = {
  name: 'rowDescription',
  length: 6,
  fieldCount: 0
}
var expectedOneRowMessage = {
  name: 'rowDescription',
  length: 27,
  fieldCount: 1
}

var expectedTwoRowMessage = {
  name: 'rowDescription',
  length: 53,
  fieldCount: 2
}

var testForMessage = function (buffer, expectedMessage) {
  var lastMessage = {}
  test('recieves and parses ' + expectedMessage.name, function () {
    var stream = new MemoryStream()
    var client = new Connection({
      stream: stream
    })
    client.connect()

    client.on('message', function (msg) {
      lastMessage = msg
    })

    client.on(expectedMessage.name, function () {
      client.removeAllListeners(expectedMessage.name)
    })

    stream.emit('data', buffer)
    assert.same(lastMessage, expectedMessage)
  })
  return lastMessage
}

var plainPasswordBuffer = buffers.authenticationCleartextPassword()
var md5PasswordBuffer = buffers.authenticationMD5Password()

var expectedPlainPasswordMessage = {
  name: 'authenticationCleartextPassword'
}

var expectedMD5PasswordMessage = {
  name: 'authenticationMD5Password'
}

var notificationResponseBuffer = buffers.notification(4, 'hi', 'boom')
var expectedNotificationResponseMessage = {
  name: 'notification',
  processId: 4,
  channel: 'hi',
  payload: 'boom'
}

test('Connection', function () {
  testForMessage(authOkBuffer, expectedAuthenticationOkayMessage)
  testForMessage(plainPasswordBuffer, expectedPlainPasswordMessage)
  var msg = testForMessage(md5PasswordBuffer, expectedMD5PasswordMessage)
  test('md5 has right salt', function () {
    assert.equalBuffers(msg.salt, Buffer.from([1, 2, 3, 4]))
  })
  testForMessage(paramStatusBuffer, expectedParameterStatusMessage)
  testForMessage(backendKeyDataBuffer, expectedBackendKeyDataMessage)
  testForMessage(readyForQueryBuffer, expectedReadyForQueryMessage)
  testForMessage(commandCompleteBuffer, expectedCommandCompleteMessage)
  testForMessage(notificationResponseBuffer, expectedNotificationResponseMessage)
  test('empty row message', function () {
    var message = testForMessage(emptyRowDescriptionBuffer, expectedEmptyRowDescriptionMessage)
    test('has no fields', function () {
      assert.equal(message.fields.length, 0)
    })
  })

  test('no data message', function () {
    testForMessage(Buffer.from([0x6e, 0, 0, 0, 4]), {
      name: 'noData'
    })
  })

  test('one row message', function () {
    var message = testForMessage(oneRowDescBuff, expectedOneRowMessage)
    test('has one field', function () {
      assert.equal(message.fields.length, 1)
    })
    test('has correct field info', function () {
      assert.same(message.fields[0], {
        name: 'id',
        tableID: 1,
        columnID: 2,
        dataTypeID: 3,
        dataTypeSize: 4,
        dataTypeModifier: 5,
        format: 'text'
      })
    })
  })

  test('two row message', function () {
    var message = testForMessage(twoRowBuf, expectedTwoRowMessage)
    test('has two fields', function () {
      assert.equal(message.fields.length, 2)
    })
    test('has correct first field', function () {
      assert.same(message.fields[0], {
        name: 'bang',
        tableID: 1,
        columnID: 2,
        dataTypeID: 3,
        dataTypeSize: 4,
        dataTypeModifier: 5,
        format: 'text'
      })
    })
    test('has correct second field', function () {
      assert.same(message.fields[1], {
        name: 'whoah',
        tableID: 10,
        columnID: 11,
        dataTypeID: 12,
        dataTypeSize: 13,
        dataTypeModifier: 14,
        format: 'text'
      })
    })
  })

  test('parsing rows', function () {
    test('parsing empty row', function () {
      var message = testForMessage(emptyRowFieldBuf, {
        name: 'dataRow',
        fieldCount: 0
      })
      test('has 0 fields', function () {
        assert.equal(message.fields.length, 0)
      })
    })

    test('parsing data row with fields', function () {
      var message = testForMessage(oneFieldBuf, {
        name: 'dataRow',
        fieldCount: 1
      })
      test('has 1 field', function () {
        assert.equal(message.fields.length, 1)
      })

      test('field is correct', function () {
        assert.equal(message.fields[0], 'test')
      })
    })
  })

  test('notice message', function () {
    // this uses the same logic as error message
    var buff = buffers.notice([{type: 'C', value: 'code'}])
    testForMessage(buff, {
      name: 'notice',
      code: 'code'
    })
  })

  test('error messages', function () {
    test('with no fields', function () {
      var msg = testForMessage(buffers.error(), {
        name: 'error'
      })
    })

    test('with all the fields', function () {
      var buffer = buffers.error([{
        type: 'S',
        value: 'ERROR'
      }, {
        type: 'C',
        value: 'code'
      }, {
        type: 'M',
        value: 'message'
      }, {
        type: 'D',
        value: 'details'
      }, {
        type: 'H',
        value: 'hint'
      }, {
        type: 'P',
        value: '100'
      }, {
        type: 'p',
        value: '101'
      }, {
        type: 'q',
        value: 'query'
      }, {
        type: 'W',
        value: 'where'
      }, {
        type: 'F',
        value: 'file'
      }, {
        type: 'L',
        value: 'line'
      }, {
        type: 'R',
        value: 'routine'
      }, {
        type: 'Z', // ignored
        value: 'alsdkf'
      }])

      testForMessage(buffer, {
        name: 'error',
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
      })
    })
  })

  test('parses parse complete command', function () {
    testForMessage(parseCompleteBuffer, {
      name: 'parseComplete'
    })
  })

  test('parses bind complete command', function () {
    testForMessage(bindCompleteBuffer, {
      name: 'bindComplete'
    })
  })

  test('parses portal suspended message', function () {
    testForMessage(portalSuspendedBuffer, {
      name: 'portalSuspended'
    })
  })

  test('parses replication start message', function () {
    testForMessage(Buffer.from([0x57, 0x00, 0x00, 0x00, 0x04]), {
      name: 'replicationStart',
      length: 4
    })
  })
})

// since the data message on a stream can randomly divide the incomming
// tcp packets anywhere, we need to make sure we can parse every single
// split on a tcp message
test('split buffer, single message parsing', function () {
  var fullBuffer = buffers.dataRow([null, 'bang', 'zug zug', null, '!'])
  var stream = new MemoryStream()
  stream.readyState = 'open'
  var client = new Connection({
    stream: stream
  })
  client.connect()
  var message = null
  client.on('message', function (msg) {
    message = msg
  })

  test('parses when full buffer comes in', function () {
    stream.emit('data', fullBuffer)
    assert.lengthIs(message.fields, 5)
    assert.equal(message.fields[0], null)
    assert.equal(message.fields[1], 'bang')
    assert.equal(message.fields[2], 'zug zug')
    assert.equal(message.fields[3], null)
    assert.equal(message.fields[4], '!')
  })

  var testMessageRecievedAfterSpiltAt = function (split) {
    var firstBuffer = Buffer.alloc(fullBuffer.length - split)
    var secondBuffer = Buffer.alloc(fullBuffer.length - firstBuffer.length)
    fullBuffer.copy(firstBuffer, 0, 0)
    fullBuffer.copy(secondBuffer, 0, firstBuffer.length)
    stream.emit('data', firstBuffer)
    stream.emit('data', secondBuffer)
    assert.lengthIs(message.fields, 5)
    assert.equal(message.fields[0], null)
    assert.equal(message.fields[1], 'bang')
    assert.equal(message.fields[2], 'zug zug')
    assert.equal(message.fields[3], null)
    assert.equal(message.fields[4], '!')
  }

  test('parses when split in the middle', function () {
    testMessageRecievedAfterSpiltAt(6)
  })

  test('parses when split at end', function () {
    testMessageRecievedAfterSpiltAt(2)
  })

  test('parses when split at beginning', function () {
    testMessageRecievedAfterSpiltAt(fullBuffer.length - 2)
    testMessageRecievedAfterSpiltAt(fullBuffer.length - 1)
    testMessageRecievedAfterSpiltAt(fullBuffer.length - 5)
  })
})

test('split buffer, multiple message parsing', function () {
  var dataRowBuffer = buffers.dataRow(['!'])
  var readyForQueryBuffer = buffers.readyForQuery()
  var fullBuffer = Buffer.alloc(dataRowBuffer.length + readyForQueryBuffer.length)
  dataRowBuffer.copy(fullBuffer, 0, 0)
  readyForQueryBuffer.copy(fullBuffer, dataRowBuffer.length, 0)

  var messages = []
  var stream = new MemoryStream()
  var client = new Connection({
    stream: stream
  })
  client.connect()
  client.on('message', function (msg) {
    messages.push(msg)
  })

  var verifyMessages = function () {
    assert.lengthIs(messages, 2)
    assert.same(messages[0], {
      name: 'dataRow',
      fieldCount: 1
    })
    assert.equal(messages[0].fields[0], '!')
    assert.same(messages[1], {
      name: 'readyForQuery'
    })
    messages = []
  }
  // sanity check
  test('recieves both messages when packet is not split', function () {
    stream.emit('data', fullBuffer)
    verifyMessages()
  })
  var splitAndVerifyTwoMessages = function (split) {
    var firstBuffer = Buffer.alloc(fullBuffer.length - split)
    var secondBuffer = Buffer.alloc(fullBuffer.length - firstBuffer.length)
    fullBuffer.copy(firstBuffer, 0, 0)
    fullBuffer.copy(secondBuffer, 0, firstBuffer.length)
    stream.emit('data', firstBuffer)
    stream.emit('data', secondBuffer)
  }

  test('recieves both messages when packet is split', function () {
    test('in the middle', function () {
      splitAndVerifyTwoMessages(11)
    })
    test('at the front', function () {
      splitAndVerifyTwoMessages(fullBuffer.length - 1)
      splitAndVerifyTwoMessages(fullBuffer.length - 4)
      splitAndVerifyTwoMessages(fullBuffer.length - 6)
    })

    test('at the end', function () {
      splitAndVerifyTwoMessages(8)
      splitAndVerifyTwoMessages(1)
    })
  })
})
