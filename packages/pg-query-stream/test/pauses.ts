import helper from './helper'
import concat from 'concat-stream'
import JSONStream from 'JSONStream'
import QueryStream from '../src'
import { Transform, TransformCallback } from 'stream'

class PauseStream extends Transform {
  constructor() {
    super({ objectMode: true })
  }

  _transform(chunk, encoding, callback): void {
    this.push(chunk, encoding)
    setTimeout(callback, 1)
  }
}

helper('pauses', function (client) {
  it('pauses', function (done) {
    this.timeout(5000)
    const stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [200], {
      batchSize: 2,
      highWaterMark: 2,
    })
    const query = client.query(stream)
    const pauser = new PauseStream()
    query
      .pipe(JSONStream.stringify())
      .pipe(pauser)
      .pipe(
        concat(function (json) {
          JSON.parse(json)
          done()
        })
      )
  })
})
