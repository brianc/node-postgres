'use strict'
require('./test-helper')
var Connection = require('../../../lib/connection')
test('connection can take existing stream', function () {
  var stream = new MemoryStream()
  var con = new Connection({ stream: stream })
  assert.equal(con.stream, stream)
})

test('using any stream', function () {
  var stream = new MemoryStream()
  var con = new Connection({ stream: stream })
  con = new Client({connection: con})
  con.connect()

  test('after stream connects client emits connected event', function () {
    var hit = false

    con.once('connect', function () {
      hit = true
    })

    assert.ok(con.emit('connect'))
    assert.ok(hit)
  })
})