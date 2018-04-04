'use strict'
require(__dirname + '/test-helper')
var Connection = require(__dirname + '/../../../lib/connection')
var stream = new MemoryStream()
var con = new Connection({
  stream: stream
})

assert.received = function (stream, buffer) {
  assert.lengthIs(stream.packets, 1)
  var packet = stream.packets.pop()
  assert.equalBuffers(packet, buffer)
}

test('sends startup message', function () {
  con.startup({
    user: 'brian',
    database: 'bang'
  })
  assert.received(stream, new BufferList()
                  .addInt16(3)
                  .addInt16(0)
                  .addCString('user')
                  .addCString('brian')
                  .addCString('database')
                  .addCString('bang')
                  .addCString('client_encoding')
                  .addCString("'utf-8'")
                  .addCString('').join(true))
})

test('sends password message', function () {
  con.password('!')
  assert.received(stream, new BufferList().addCString('!').join(true, 'p'))
})

test('sends query message', function () {
  var txt = 'select * from boom'
  con.query(txt)
  assert.received(stream, new BufferList().addCString(txt).join(true, 'Q'))
})

test('sends parse message', function () {
  con.parse({text: '!'})
  var expected = new BufferList()
    .addCString('')
    .addCString('!')
    .addInt16(0).join(true, 'P')
  assert.received(stream, expected)
})

test('sends parse message with named query', function () {
  con.parse({
    name: 'boom',
    text: 'select * from boom',
    types: []
  })
  var expected = new BufferList()
    .addCString('boom')
    .addCString('select * from boom')
    .addInt16(0).join(true, 'P')
  assert.received(stream, expected)

  test('with multiple parameters', function () {
    con.parse({
      name: 'force',
      text: 'select * from bang where name = $1',
      types: [1, 2, 3, 4]
    })
    var expected = new BufferList()
      .addCString('force')
      .addCString('select * from bang where name = $1')
      .addInt16(4)
      .addInt32(1)
      .addInt32(2)
      .addInt32(3)
      .addInt32(4).join(true, 'P')
    assert.received(stream, expected)
  })
})

test('bind messages', function () {
  test('with no values', function () {
    con.bind()

    var expectedBuffer = new BufferList()
      .addCString('')
      .addCString('')
      .addInt16(0)
      .addInt16(0)
      .addInt16(0)
      .join(true, 'B')
    assert.received(stream, expectedBuffer)
  })

  test('with named statement, portal, and values', function () {
    con.bind({
      portal: 'bang',
      statement: 'woo',
      values: ['1', 'hi', null, 'zing']
    })
    var expectedBuffer = new BufferList()
      .addCString('bang')  // portal name
      .addCString('woo') // statement name
      .addInt16(0)
      .addInt16(4)
      .addInt32(1)
      .add(Buffer.from('1'))
      .addInt32(2)
      .add(Buffer.from('hi'))
      .addInt32(-1)
      .addInt32(4)
      .add(Buffer.from('zing'))
      .addInt16(0)
      .join(true, 'B')
    assert.received(stream, expectedBuffer)
  })
})

test('with named statement, portal, and buffer value', function () {
  con.bind({
    portal: 'bang',
    statement: 'woo',
    values: ['1', 'hi', null, Buffer.from('zing', 'utf8')]
  })
  var expectedBuffer = new BufferList()
    .addCString('bang')  // portal name
    .addCString('woo') // statement name
    .addInt16(4)// value count
    .addInt16(0)// string
    .addInt16(0)// string
    .addInt16(0)// string
    .addInt16(1)// binary
    .addInt16(4)
    .addInt32(1)
    .add(Buffer.from('1'))
    .addInt32(2)
    .add(Buffer.from('hi'))
    .addInt32(-1)
    .addInt32(4)
    .add(Buffer.from('zing', 'UTF-8'))
    .addInt16(0)
    .join(true, 'B')
  assert.received(stream, expectedBuffer)
})

test('sends execute message', function () {
  test('for unamed portal with no row limit', function () {
    con.execute()
    var expectedBuffer = new BufferList()
      .addCString('')
      .addInt32(0)
      .join(true, 'E')
    assert.received(stream, expectedBuffer)
  })

  test('for named portal with row limit', function () {
    con.execute({
      portal: 'my favorite portal',
      rows: 100
    })
    var expectedBuffer = new BufferList()
      .addCString('my favorite portal')
      .addInt32(100)
      .join(true, 'E')
    assert.received(stream, expectedBuffer)
  })
})

test('sends flush command', function () {
  con.flush()
  var expected = new BufferList().join(true, 'H')
  assert.received(stream, expected)
})

test('sends sync command', function () {
  con.sync()
  var expected = new BufferList().join(true, 'S')
  assert.received(stream, expected)
})

test('sends end command', function () {
  con.end()
  var expected = Buffer.from([0x58, 0, 0, 0, 4])
  assert.received(stream, expected)
  assert.equal(stream.closed, true)
})

test('sends describe command', function () {
  test('describe statement', function () {
    con.describe({type: 'S', name: 'bang'})
    var expected = new BufferList().addChar('S').addCString('bang').join(true, 'D')
    assert.received(stream, expected)
  })

  test('describe unnamed portal', function () {
    con.describe({type: 'P'})
    var expected = new BufferList().addChar('P').addCString('').join(true, 'D')
    assert.received(stream, expected)
  })
})
