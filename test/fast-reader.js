var assert = require('assert')
var helper = require('./helper')
var QueryStream = require('../')

helper(function(client) {
  it('works', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
    var query = client.query(stream)
    var result = []
    stream.on('readable', function() {
      var res = stream.read()
      assert(res, 'should not return null on evented reader')
      result.push(res.num)
    })
    stream.on('end', function() {
      var total = result.reduce(function(prev, cur) {
        return prev + cur
      })
      assert.equal(total, 20100)
      done()
    })
    assert.strictEqual(query.read(2), null)
  })
})
