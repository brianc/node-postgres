import assert from 'assert'
import helper from './helper'
import QueryStream from '../src'

helper('error', function (client) {
  it('receives error on stream', function (done) {
    const stream = new QueryStream('SELECT * FROM asdf num', [])
    const query = client.query(stream)
    query
      .on('error', function (err) {
        assert(err)
        assert.equal(err.code, '42P01')
        done()
      })
      .on('data', function () {
        // noop to kick of reading
      })
  })

  it('continues to function after stream', function (done) {
    client.query('SELECT NOW()', done)
  })
})
