var pg = require('pg')
var assert = require('assert')
var gonna = require('gonna')
var _ = require('lodash')
var concat = require('concat-stream')
var through = require('through')

var QueryStream = require('../')

var client = new pg.Client()

var connected = gonna('connect', 100, function() {
  var stream = new QueryStream('SELECT * FROM asdf num', [])
  var query = client.query(stream)
  query.on('error', gonna('emit error', 100, function(err) {
    assert(err)
    assert.equal(err.code, '42P01')
  }))
  var done = gonna('keep connetion alive', 100)
  client.query('SELECT NOW()', done)
})

client.connect(connected)
client.on('drain', client.end.bind(client))
