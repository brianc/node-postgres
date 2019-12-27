var assert = require('assert')
var concat = require('concat-stream')

var QueryStream = require('../')
var helper = require('./helper')

helper('close', function (client) {
  it('emits close', function (done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [3], {batchSize: 2, highWaterMark: 2})
    var query = client.query(stream)
    query.pipe(concat(function () {}))
    query.on('close', done)
  })
})

helper('early close', function (client) {
  it('can be closed early', function (done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [20000], {batchSize: 2, highWaterMark: 2})
    var query = client.query(stream)
    var readCount = 0
    query.on('readable', function () {
      readCount++
      query.read()
    })
    query.once('readable', function () {
      query.close()
    })
    query.on('close', function () {
      assert(readCount < 10, 'should not have read more than 10 rows')
      done()
    })
  })
})

helper('close callback', function (client) {
  it('notifies an optional callback when the conneciton is closed', function (done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [10], {batchSize: 2, highWaterMark: 2})
    var query = client.query(stream)
    query.once('readable', function () { // only reading once
      query.read()
    })
    query.once('readable', function () {
      query.close(function () {
        // nothing to assert.  This test will time out if the callback does not work.
        done()
      })
    })
    query.on('close', function () {
      assert(false, 'close event should not fire') // no close event because we did not read to the end of the stream.
    })
  })
})
