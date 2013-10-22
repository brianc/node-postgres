var pg = require('pg')
var assert = require('assert')
var gonna = require('gonna')
var _ = require('lodash')
var concat = require('concat-stream')
var through = require('through')

var QueryStream = require('../')

var client = new pg.Client()

var connected = gonna('connect', 100, function() {
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
  stream.on('end', client.end.bind(client))
})

client.connect(connected)
