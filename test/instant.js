var pg = require('pg')
var assert = require('assert')
var gonna = require('gonna')
var concat = require('concat-stream')

var QueryStream = require('../')

var client = new pg.Client()
var query = new QueryStream('SELECT pg_sleep(1)', [])
var stream = client.query(query)
var done = gonna('read results', 5000)
stream.pipe(concat(function(res) {
  assert.equal(res.length, 1)
  done()
  client.end()
}))
client.connect()
