'use strict'
var helper = require(__dirname + '/test-helper')
var Connection = require(__dirname + '/../../../lib/connection')
var net = require('net')

const suite = new helper.Suite()

suite.test('connection emits stream errors', function (done) {
  var con = new Connection({stream: new MemoryStream()})
  assert.emits(con, 'error', function (err) {
    assert.equal(err.message, 'OMG!')
    done()
  })
  con.connect()
  con.stream.emit('error', new Error('OMG!'))
})

suite.test('connection emits ECONNRESET errors during normal operation', function (done) {
  var con = new Connection({stream: new MemoryStream()})
  con.connect()
  assert.emits(con, 'error', function (err) {
    assert.equal(err.code, 'ECONNRESET')
    done()
  })
  var e = new Error('Connection Reset')
  e.code = 'ECONNRESET'
  con.stream.emit('error', e)
})

suite.test('connection does not emit ECONNRESET errors during disconnect', function (done) {
  var con = new Connection({stream: new MemoryStream()})
  con.connect()
  var e = new Error('Connection Reset')
  e.code = 'ECONNRESET'
  con.end()
  con.stream.emit('error', e)
  done()
})


suite.test('connection does not emit ECONNRESET errors during disconnect also when using SSL', function (done) {
  // our fake postgres server, which just responds with 'S' to start SSL
  var socket
  var server = net.createServer(function (c) {
    socket = c
    c.once('data', function (data) {
      c.write(Buffer.from('S'))
    })
  })

  server.listen(7778, function () {
    var con = new Connection({ssl: true})
    con.connect(7778, 'localhost')
    assert.emits(con, 'sslconnect', function () {
      con.end()
      socket.destroy()
      server.close()
      done()
    })
    con.requestSsl()
  })
})
