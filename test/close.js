var assert = require('assert')
var concat = require('concat-stream')
var tester = require('stream-tester')
var JSONStream = require('JSONStream')

var QueryStream = require('../')

require('./helper')('close', function(client) {
  it('emits close', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [3], {batchSize: 2, highWaterMark: 2})
    var query = client.query(stream)
    query.pipe(concat(function() {}))
    query.on('close', done)
  })
})
