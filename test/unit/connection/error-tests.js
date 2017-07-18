'use strict'
var helper = require(__dirname + '/test-helper')
var Connection = require(__dirname + '/../../../lib/connection')
test('connection emits stream errors', function () {
  var con = new Connection({stream: new MemoryStream()})
  assert.emits(con, 'error', function (err) {
    assert.equal(err.message, 'OMG!')
  })
  con.connect()
  con.stream.emit('error', new Error('OMG!'))
})

test('connection emits ECONNRESET errors during normal operation', function () {
  var con = new Connection({stream: new MemoryStream()})
  con.connect()
  assert.emits(con, 'error', function (err) {
    assert.equal(err.code, 'ECONNRESET')
  })
  var e = new Error('Connection Reset')
  e.code = 'ECONNRESET'
  con.stream.emit('error', e)
})

test('connection does not emit ECONNRESET errors during disconnect', function () {
  var con = new Connection({stream: new MemoryStream()})
  con.connect()
  var e = new Error('Connection Reset')
  e.code = 'ECONNRESET'
  con.end()
  con.stream.emit('error', e)
})
