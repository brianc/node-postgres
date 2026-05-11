'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('pipeline: query() returns object with cancel() method', function () {
  const client = helper.client()
  client._pipelineMode = true
  client._connected = true

  const con = client.connection
  con.parse = function () {}
  con.bind = function () {}
  con.describe = function () {}
  con.execute = function () {}
  con.sync = function () {}
  con.flush = function () {}
  con.stream = { cork: function () {}, uncork: function () {} }

  const result = client.query({ text: 'SELECT 1' })

  assert.equal(typeof result.cancel, 'function', 'query() should return object with cancel() method')
})

test('pipeline: cancel() on queued query removes it and rejects', function (done) {
  const client = helper.client()
  client._pipelineMode = true
  client._connected = false

  const con = client.connection
  con.parse = function () {}
  con.bind = function () {}
  con.describe = function () {}
  con.execute = function () {}
  con.sync = function () {}
  con.flush = function () {}
  con.stream = { cork: function () {}, uncork: function () {} }

  const result = client.query({ text: 'SELECT 1' })

  assert.equal(client._queryQueue.length, 1, 'Query should be in queue')

  result.cancel()

  assert.equal(client._queryQueue.length, 0, 'Query should be removed from queue')

  result.catch(function (err) {
    assert.ok(err instanceof Error)
    assert.equal(err.cancelled, true)
    done()
  })
})

test('pipeline: cancel() on completed query does not throw', function (done) {
  const client = helper.client()
  client._pipelineMode = true
  client._connected = true

  const con = client.connection
  con.parse = function () {}
  con.bind = function () {}
  con.describe = function () {}
  con.execute = function () {}
  con.sync = function () {}
  con.flush = function () {}
  con.stream = { cork: function () {}, uncork: function () {} }

  const result = client.query({ text: 'SELECT 1' })

  // Catch the promise to avoid unhandled rejection
  result.catch(function () {})

  // Simulate completion
  client._queryQueue.length = 0
  client._pendingQueries.length = 0

  assert.doesNotThrow(function () {
    result.cancel()
  })

  done()
})

test('pipeline: cancelled query does not affect others', function (done) {
  const client = helper.client()
  client._pipelineMode = true
  client._connected = false

  const con = client.connection
  con.parse = function () {}
  con.bind = function () {}
  con.describe = function () {}
  con.execute = function () {}
  con.sync = function () {}
  con.flush = function () {}
  con.stream = { cork: function () {}, uncork: function () {} }

  const r1 = client.query({ text: 'SELECT 1' })
  const r2 = client.query({ text: 'SELECT 2' })
  const r3 = client.query({ text: 'SELECT 3' })

  // Catch all to avoid unhandled rejections
  r1.catch(function () {})
  r2.catch(function () {})
  r3.catch(function () {})

  assert.equal(client._queryQueue.length, 3)

  r2.cancel()

  assert.equal(client._queryQueue.length, 2)

  done()
})

test('pipeline: cancel() preserved through .then().catch() chain', function () {
  const client = helper.client()
  client._pipelineMode = true
  client._connected = true

  const con = client.connection
  con.parse = function () {}
  con.bind = function () {}
  con.describe = function () {}
  con.execute = function () {}
  con.sync = function () {}
  con.flush = function () {}
  con.stream = { cork: function () {}, uncork: function () {} }

  const result = client
    .query({ text: 'SELECT 1' })
    .then(function (r) {
      return r
    })
    .catch(function (err) {
      throw err
    })

  assert.equal(typeof result.cancel, 'function', 'cancel() should be preserved through .then().catch() chain')
})
