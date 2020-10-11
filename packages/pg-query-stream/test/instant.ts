import assert from 'assert'
import helper from './helper'
import concat from 'concat-stream'
import QueryStream from '../src'

helper('instant', function (client) {
  it('instant', function (done) {
    const query = new QueryStream('SELECT pg_sleep(1)', [])
    const stream = client.query(query)
    stream.pipe(
      concat(function (res) {
        assert.strictEqual(res.length, 1)
        done()
      })
    )
  })
})
