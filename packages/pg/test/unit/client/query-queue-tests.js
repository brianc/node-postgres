'use strict'
const helper = require('./test-helper')
const { Client } = helper
const Connection = require('../../../lib/connection')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('drain', function () {
  const con = new Connection({ stream: 'NO' })
  const client = new Client({ connection: con })
  con.connect = function () {
    con.emit('connect')
  }
  con.query = function () {}
  client.connect()

  let raisedDrain = false
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
