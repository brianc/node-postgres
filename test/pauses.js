var pg = require('pg')
var assert = require('assert')
var gonna = require('gonna')
var _ = require('lodash')
var concat = require('concat-stream')
var through = require('through')
var tester = require('stream-tester')
var JSONStream = require('JSONStream')
var stream = require('stream')

var QueryStream = require('../')

var client = new pg.Client()

var connected = gonna('connect', 100, function() {
  var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [200], {chunkSize: 2, highWaterMark: 2})
  var query = client.query(stream)
  var pauser = tester.createPauseStream(0.1, 100)
  query.pipe(JSONStream.stringify()).pipe(concat(function(json) {
    JSON.parse(json)
    client.end()
  }))
})

client.connect(connected)
