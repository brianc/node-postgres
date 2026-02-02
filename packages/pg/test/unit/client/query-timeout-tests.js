'use strict'

const helper = require('./test-helper')
const Query = require('../../../lib/query')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

// Regression tests for GitHub issue #1860
// https://github.com/brianc/node-postgres/issues/1860
//
// When a Submittable (Query, QueryStream, Cursor) is passed to client.query()
// with query_timeout configured but WITHOUT a callback, the client would crash
// with "TypeError: queryCallback is not a function" when the timeout fires.
//
// The fix: queryCallback = query.callback || (() => {})

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
