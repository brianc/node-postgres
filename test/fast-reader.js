var assert = require('assert')
var helper = require('./helper')
var QueryStream = require('../')

helper('fast reader', function(client) {
  it('works', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
    var query = client.query(stream)
    var result = []
    var count = 0
    stream.on('readable', function() {
      var res = stream.read()
      if (result.length !== 201) {
        assert(res, 'should not return null on evented reader')
      } else {
        //a readable stream will emit a null datum when it finishes being readable
        //https://nodejs.org/api/stream.html#stream_event_readable
        assert.equal(res, null)
      }
      if(res) {
        result.push(res.num)
      }
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
