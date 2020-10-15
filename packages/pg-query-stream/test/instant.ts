import helper from './helper'
import assert from 'assert'
import concat from 'concat-stream'
import QueryStream from '../src'

helper('instant', function (client) {
  it('instant', function (done) {
    const query = new QueryStream('SELECT pg_sleep(1)', [])
    const stream = client.query(query)
    stream.pipe(
      concat(function (res) {
        assert.equal(res.length, 1)
        done()
      })
    )
  })
})
