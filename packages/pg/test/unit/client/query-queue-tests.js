'use strict'
const helper = require('./test-helper')
const { Client } = helper
var Connection = require('../../../lib/connection')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('drain', function () {
  var con = new Connection({ stream: 'NO' })
  var client = new Client({ connection: con })
  con.connect = function () {
    con.emit('connect')
  }
  con.query = function () {}
  client.connect()

  var raisedDrain = false
  client.on('drain', function () {
    raisedDrain = true
  })

  client.query('hello')
  client.query('sup')
  client.query('boom')
  assert.equal(raisedDrain, false)
  con.emit('readyForQuery')

  assert.equal(raisedDrain, false)
  con.emit('readyForQuery')
  con.emit('readyForQuery')
  assert.equal(raisedDrain, false)
  con.emit('readyForQuery')

  process.nextTick(function () {
    assert.ok(raisedDrain)
  })
})
