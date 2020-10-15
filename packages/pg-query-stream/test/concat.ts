import assert from 'assert'
import concat from 'concat-stream'
import { Transform } from 'stream'
import helper from './helper'
import QueryStream from '../src'

helper('concat', function (client) {
  it('concats correctly', function (done) {
    const stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
    const query = client.query(stream)
    query
      .pipe(
        new Transform({
          transform(chunk, _, callback) {
            callback(null, chunk.num)
          },
          objectMode: true,
        })
      )
      .pipe(
        concat(function (result) {
          const total = result.reduce(function (prev, cur) {
            return prev + cur
          })
          assert.equal(total, 20100)
        })
      )
    stream.on('end', done)
  })
})
