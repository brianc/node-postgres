var assert = require('assert')
var concat = require('concat-stream')
var through = require('through')
var helper = require('./helper')

var QueryStream = require('../')

helper('concat', function(client) {
  it('concats correctly', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
    var query = client.query(stream)
    query.pipe(through(function(row) {
      this.push(row.num)
    })).pipe(concat(function(result) {
      var total = result.reduce(function(prev, cur) {
        return prev + cur
      })
      assert.equal(total, 20100)
    }))
    stream.on('end', done)
  })
})
