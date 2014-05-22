var assert = require('assert')
var concat = require('concat-stream')
var tester = require('stream-tester')
var JSONStream = require('JSONStream')

var QueryStream = require('../')

require('./helper')('pauses', function(client) {
  it('pauses', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [200], {batchSize: 2, highWaterMark: 2})
    var query = client.query(stream)
    var pauser = tester.createPauseStream(0.1, 100)
    query.pipe(JSONStream.stringify()).pipe(concat(function(json) {
      JSON.parse(json)
      done()
    }))
  })
})
