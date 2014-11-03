var assert = require('assert')
var helper = require('./helper')
var QueryStream = require('../')
var concat = require('concat-stream')

var Transform = require('stream').Transform

var mapper = new Transform({objectMode: true})

mapper._transform = function(obj, enc, cb) {
    this.push(obj)
    setTimeout(cb, 5)
}

helper('slow reader', function(client) {
  it('works', function(done) {
    this.timeout(50000)
    var stream = new QueryStream('SELECT * FROM generate_series(0, 201) num', [], {highWaterMark: 100, batchSize: 50})
    stream.on('end', function() {
      //console.log('stream end')
    })
    var query = client.query(stream)
    var result = []
    var count = 0
    stream.pipe(mapper).pipe(concat(function(res) {
      done()
    }))
  })
})
