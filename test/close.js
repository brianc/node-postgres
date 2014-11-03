var assert = require('assert')
var concat = require('concat-stream')
var tester = require('stream-tester')
var JSONStream = require('JSONStream')

var QueryStream = require('../')
var helper = require('./helper')

helper('close', function(client) {
  it('emits close', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [3], {batchSize: 2, highWaterMark: 2})
    var query = client.query(stream)
    query.pipe(concat(function() {}))
    query.on('close', done)
  })
})

helper('early close', function(client) {
  it('can be closed early', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [20000], {batchSize: 2, highWaterMark: 2})
    var query = client.query(stream)
    var readCount = 0
    query.on('readable', function() {
      readCount++
      query.read()
    })
    query.once('readable', function() {
      query.close()
    })
    query.on('close', function() {
      assert(readCount < 10, 'should not have read more than 10 rows')
      done()
    })
  })
})
