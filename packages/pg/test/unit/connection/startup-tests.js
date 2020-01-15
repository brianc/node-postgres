'use strict'
require(__dirname + '/test-helper')
var Connection = require(__dirname + '/../../../lib/connection')
test('connection can take existing stream', function () {
  var stream = new MemoryStream()
  var con = new Connection({stream: stream})
  assert.equal(con.stream, stream)
})

test('using closed stream', function () {
  var makeStream = function () {
    var stream = new MemoryStream()
    stream.readyState = 'closed'
    stream.connect = function (port, host) {
      this.connectCalled = true
      this.port = port
      this.host = host
    }
    return stream
  }

  var stream = makeStream()

  var con = new Connection({stream: stream})

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
    var hit = false

    con.once('connect', function () {
      hit = true
    })

    assert.ok(stream.emit('connect'))
    assert.ok(hit)
  })

  test('after stream emits connected event init TCP-keepalive', function () {
    var stream = makeStream()
    var con = new Connection({ stream: stream, keepAlive: true })
    con.connect(123, 'test')

    var res = false

    stream.setKeepAlive = function (bit) {
      res = bit
    }

    assert.ok(stream.emit('connect'))
    setTimeout(function () {
      assert.equal(res, true)
    })
  })
})

test('using opened stream', function () {
  var stream = new MemoryStream()
  stream.readyState = 'open'
  stream.connect = function () {
    assert.ok(false, 'Should not call open')
  }
  var con = new Connection({stream: stream})
  test('does not call open', function () {
    var hit = false
    con.once('connect', function () {
      hit = true
    })
    con.connect()
    assert.ok(hit)
  })
})
