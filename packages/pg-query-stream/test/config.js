var assert = require('assert')
var QueryStream = require('../')

describe('stream config options', () => {
  // this is mostly for backwards compatability.
  it('sets readable.highWaterMark based on batch size', () => {
    var stream = new QueryStream('SELECT NOW()', [], {
      batchSize: 88,
    })
    assert.equal(stream._readableState.highWaterMark, 88)
  })

  it('sets readable.highWaterMark based on highWaterMark config', () => {
    var stream = new QueryStream('SELECT NOW()', [], {
      highWaterMark: 88,
    })

    assert.equal(stream._readableState.highWaterMark, 88)
  })

  it('defaults to 100 for highWaterMark', () => {
    var stream = new QueryStream('SELECT NOW()', [])

    assert.equal(stream._readableState.highWaterMark, 100)
  })
})
