import assert from 'assert'
import helper from './helper'
import QueryStream from '../src'

describe('stream config options', () => {
  // this is mostly for backwards compatibility.
  it('sets readable.highWaterMark based on batch size', () => {
    const stream = new QueryStream('SELECT NOW()', [], {
      batchSize: 88,
    })
    assert.deepStrictEqual(stream.readableHighWaterMark, 88)
  })

  it('sets readable.highWaterMark based on highWaterMark config', () => {
    const stream = new QueryStream('SELECT NOW()', [], {
      highWaterMark: 88,
    })

    assert.deepStrictEqual(stream.readableHighWaterMark, 88)
  })

  it('defaults to 100 for highWaterMark', () => {
    const stream = new QueryStream('SELECT NOW()', [])

    assert.deepStrictEqual(stream.readableHighWaterMark, 100)
  })
})
