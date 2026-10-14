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

// setTimeout() treats a delay above 2^31-1 ms as 1 ms, so the client must clamp the delays it passes
const MAX_TIMEOUT = 2147483647

// Record the delay of every setTimeout call made by `fn`, without scheduling anything
const recordTimerDelays = (fn) => {
  const originalSetTimeout = global.setTimeout
  const delays = []
  global.setTimeout = (cb, delay) => {
    delays.push(delay)
    return { unref() {} }
  }
  try {
    fn()
  } finally {
    global.setTimeout = originalSetTimeout
  }
  return delays
}

test('query_timeout above 2^31-1 ms is clamped to what setTimeout supports', function () {
  const client = helper.client()
  client.connectionParameters = { query_timeout: Math.pow(2, 31) }
  client.connection.emit('readyForQuery')

  const delays = recordTimerDelays(() => client.query('SELECT 1', () => {}))
  assert.deepEqual(delays, [MAX_TIMEOUT])
})

test('per-query query_timeout above 2^31-1 ms is clamped to what setTimeout supports', function () {
  const client = helper.client()
  client.connection.emit('readyForQuery')

  const delays = recordTimerDelays(() => client.query({ text: 'SELECT 1', query_timeout: Infinity }, () => {}))
  assert.deepEqual(delays, [MAX_TIMEOUT])
})

test('query_timeout within the supported range is passed to setTimeout unchanged', function () {
  const client = helper.client()
  client.connectionParameters = { query_timeout: 60000 }
  client.connection.emit('readyForQuery')

  const delays = recordTimerDelays(() => client.query('SELECT 1', () => {}))
  assert.deepEqual(delays, [60000])
})

test('connectionTimeoutMillis above 2^31-1 ms is clamped to what setTimeout supports', function () {
  const delays = recordTimerDelays(() => helper.client({ connectionTimeoutMillis: Math.pow(2, 31) }))
  assert.deepEqual(delays, [MAX_TIMEOUT])
})
