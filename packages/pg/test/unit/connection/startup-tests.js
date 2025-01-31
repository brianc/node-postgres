'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const Connection = require('../../../lib/connection')
const suite = new helper.Suite()
const test = suite.test.bind(suite)
const { MemoryStream } = helper
test('connection can take existing stream', function () {
  const stream = new MemoryStream()
  const con = new Connection({ stream: stream })
  assert.equal(con.stream, stream)
})

test('connection can take stream factory method', function () {
  const stream = new MemoryStream()
  const connectionOpts = {}
  const makeStream = function (opts) {
    assert.equal(connectionOpts, opts)
    return stream
  }
  connectionOpts.stream = makeStream
  const con = new Connection(connectionOpts)
  assert.equal(con.stream, stream)
})

test('using any stream', function () {
  const makeStream = function () {
    const stream = new MemoryStream()
    stream.connect = function (port, host) {
      this.connectCalled = true
      this.port = port
      this.host = host
    }
    return stream
  }

  const stream = makeStream()

  const con = new Connection({ stream: stream })

  con.connect(1234, 'bang')

  test('makes stream connect', function () {
    assert.equal(stream.connectCalled, true)
  })

  test('uses configured port', function () {
    assert.equal(stream.port, 1234)
  })

  test('uses configured host', function () {
    assert.equal(stream.host, 'bang')
  })

  test('after stream connects client emits connected event', function () {
    let hit = false

    con.once('connect', function () {
      hit = true
    })

    assert.ok(stream.emit('connect'))
    assert.ok(hit)
  })

  test('after stream emits connected event init TCP-keepalive', function () {
    const stream = makeStream()
    const con = new Connection({ stream: stream, keepAlive: true })
    con.connect(123, 'test')

    let res = false

    stream.setKeepAlive = function (bit) {
      res = bit
    }

    assert.ok(stream.emit('connect'))
    setTimeout(function () {
      assert.equal(res, true)
    })
  })
})
