var assert = require('assert')
var concat = require('concat-stream')

var QueryStream = require('../')

require('./helper')('instant', function(client) {
  it('instant', function(done) {
    var query = new QueryStream('SELECT pg_sleep(1)', [])
    var stream = client.query(query)
    stream.pipe(concat(function(res) {
      assert.equal(res.length, 1)
      done()
    }))
  })
})
