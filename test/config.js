var assert = require('assert')
var QueryStream = require('../')

var stream = new QueryStream('SELECT NOW()', [], {
  highWaterMark: 999,
  batchSize: 88
})

assert.equal(stream._readableState.highWaterMark, 999)
assert.equal(stream.batchSize, 88)
