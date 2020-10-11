import helper from './helper'
import concat from 'concat-stream'
import QueryStream from '../src'
import tester from 'stream-tester'
import JSONStream from 'JSONStream'

helper('pauses', function (client) {
  it('pauses', function (done) {
    this.timeout(5000)
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [200], { batchSize: 2, highWaterMark: 2 })
    var query = client.query(stream)
    var pauser = tester.createPauseStream(0.1, 100)
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
