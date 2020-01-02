var assert = require('assert')
var QueryStream = require('../')

var stream = new QueryStream('SELECT NOW()', [], {
  batchSize: 88
})

assert.equal(stream._readableState.highWaterMark, 88)
