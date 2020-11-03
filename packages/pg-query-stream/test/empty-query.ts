import helper from './helper'
import QueryStream from '../src'

helper('empty-query', function (client) {
  it('handles empty query', function (done) {
    const stream = new QueryStream('-- this is a comment', [])
    const query = client.query(stream)
    query
      .on('end', function () {
        // nothing should happen for empty query
        done()
      })
      .on('data', function () {
        // noop to kick off reading
      })
  })

  it('continues to function after stream', function (done) {
    client.query('SELECT NOW()', done)
  })
})
