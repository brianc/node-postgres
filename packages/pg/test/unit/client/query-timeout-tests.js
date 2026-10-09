'use strict'

const helper = require('./test-helper')
const Query = require('../../../lib/query')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('query timeout with Submittable without callback delivers error via handleError', function (done) {
  const client = helper.client()
  client.connectionParameters = { query_timeout: 10 }

  const query = new Query({ text: 'SELECT 1' })
  query.handleError = (err) => {
    assert.equal(err.message, 'Query read timeout')
    done()
  }

  client.connection.emit('readyForQuery')
  client.query(query)
})

test('query timeout with Submittable with callback delivers error via callback', function (done) {
  const client = helper.client()
  client.connectionParameters = { query_timeout: 10 }

  const query = new Query({ text: 'SELECT 1' })
  client.connection.emit('readyForQuery')

  client.query(query, (err) => {
    assert.equal(err.message, 'Query read timeout')
    done()
  })
})

test('handleError emits error even when callback is present', function (done) {
  const query = new Query({ text: 'SELECT 1' })
  const err = new Error('boom')
  let emitted = false
  let called = false

  query.on('error', (emittedErr) => {
    assert.equal(emittedErr, err)
    emitted = true
    if (called) done()
  })
  query.callback = (callbackErr) => {
    assert.equal(callbackErr, err)
    called = true
    if (emitted) done()
  }

  query.handleError(err)
})
