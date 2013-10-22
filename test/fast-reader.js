var pg = require('pg')
var assert = require('assert')
var gonna = require('gonna')
var _ = require('lodash')

var QueryStream = require('../')

var client = new pg.Client()

var connected = gonna('connect', 100, function() {
  var stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
  var query = client.query(stream)
  var result = []
  stream.on('readable', function() {
    var res = stream.read()
    assert(res, 'should not return null on evented reader')
    result.push(res.num)
  })
  stream.on('end', client.end.bind(client))
  stream.on('end', function() {
    var total = result.reduce(function(prev, cur) {
      return prev + cur
    })
    assert.equal(total, 20100)
  })
  assert.strictEqual(query.read(2), null)
})

client.connect(connected)
