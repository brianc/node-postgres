var pg = require('pg')
var assert = require('assert')
var gonna = require('gonna')
var tester = require('stream-tester')

var QueryStream = require('../')

var client = new pg.Client()

var connected = gonna('connect', 100, function() {
  var stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
  var spec = require('stream-spec')
  var query = client.query(stream)
  spec(query)
    .readable()
    .pausable({strict: true})
    .validateOnExit()
  stream.on('end', client.end.bind(client))
})

client.connect(connected)
