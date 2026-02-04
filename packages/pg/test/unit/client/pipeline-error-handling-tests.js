'use strict'
const Connection = require('../../../lib/connection')
const Client = require('../../../lib/client')
const Query = require('../../../lib/query')
const assert = require('assert')
const Suite = require('../../suite')
const EventEmitter = require('events').EventEmitter

const suite = new Suite()

// Create a mock stream for testing
const createMockStream = function () {
  const stream = new EventEmitter()
  stream.setNoDelay = () => {}
  stream.connect = function () {}
  stream.write = function () {}
  stream.cork = function () {}
  stream.uncork = function () {}
  stream.writable = true
  return stream
}

// Create a pipeline mode client for testing
const createPipelineClient = function () {
  const stream = createMockStream()
  const connection = new Connection({ stream: stream })
  connection.startup = function () {}
  connection.connect = function () {}
  connection.parse = function () {}
  connection.bind = function () {}
  connection.describe = function () {}
  connection.execute = function () {}
  connection.sync = function () {}
  connection.parsedStatements = {}

  const client = new Client({
    connection: connection,
    pipelineMode: true,
  })
  client.connect()
  client.connection.emit('connect')
  return client
}

suite.test('pipeline mode - _getCurrentPipelineQuery returns first pending query', function (done) {
  const client = createPipelineClient()

  // Initially no pending queries
  assert.equal(client._getCurrentPipelineQuery(), undefined)

  // Simulate connection ready and submit queries
  client.connection.emit('readyForQuery')

  client.query('SELECT 1')
  client.query('SELECT 2')

  // First pending query should be returned
  const currentQuery = client._getCurrentPipelineQuery()
  assert.ok(currentQuery, 'Should have a current pipeline query')
  assert.equal(currentQuery.text, 'SELECT 1')
  done()
})

suite.test('pipeline mode error handling - error is passed to current query', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Create a query with a callback to capture the error
  let capturedError = null
  const query = new Query('SELECT 1', [], function (err) {
    capturedError = err
  })

  // Add query to pending queries (simulating what _pulseQueryQueue does)
  client._pendingQueries.push(query)

  // Simulate error message
  const errorMsg = new Error('Test error for query')
  errorMsg.severity = 'ERROR'
  errorMsg.code = '42P01'

  // Emit error message - should call handleError on current query
  client.connection.emit('errorMessage', errorMsg)

  // Verify the error was passed to the query
  process.nextTick(() => {
    assert.ok(capturedError, 'Query should have received an error')
    assert.equal(capturedError.message, 'Test error for query')
    done()
  })
})

suite.test('pipeline mode error handling - connection remains usable', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Create a query with a callback
  const query = new Query('SELECT 1', [], function () {})
  client._pendingQueries.push(query)

  // Simulate error
  const errorMsg = new Error('Test error')
  client.connection.emit('errorMessage', errorMsg)

  // Verify client is still usable
  process.nextTick(() => {
    assert.ok(client._queryable, 'Client should still be queryable')
    assert.ok(!client._ended, 'Client should not be ended')
    done()
  })
})

suite.test('pipeline mode error - does not emit connection-level error', function (done) {
  const client = createPipelineClient()

  // Track if error event is emitted on client
  let clientErrorEmitted = false
  client.on('error', () => {
    clientErrorEmitted = true
  })

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Create a query with a callback
  const query = new Query('SELECT 1', [], function () {})
  client._pendingQueries.push(query)

  // Simulate error
  const errorMsg = new Error('Test error')
  client.connection.emit('errorMessage', errorMsg)

  process.nextTick(() => {
    assert.ok(!clientErrorEmitted, 'Client should not emit error event in pipeline mode')
    done()
  })
})

suite.test('pipeline mode error - does not clear _activeQuery', function (done) {
  const client = createPipelineClient()

  // Set a fake active query (shouldn't be used in pipeline mode)
  client._activeQuery = { text: 'FAKE ACTIVE QUERY' }

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Create a query with a callback
  const query = new Query('SELECT 1', [], function () {})
  client._pendingQueries.push(query)

  // Simulate error
  const errorMsg = new Error('Test error')
  client.connection.emit('errorMessage', errorMsg)

  process.nextTick(() => {
    // In pipeline mode, _activeQuery should not be cleared
    assert.ok(client._activeQuery, '_activeQuery should not be cleared in pipeline mode')
    assert.equal(client._activeQuery.text, 'FAKE ACTIVE QUERY')
    done()
  })
})

suite.test('non-pipeline mode error handling - existing behavior preserved', function (done) {
  // Create a non-pipeline client
  const stream = createMockStream()
  const connection = new Connection({ stream: stream })
  connection.startup = function () {}
  connection.connect = function () {}
  connection.query = function () {}
  connection.parsedStatements = {}

  const client = new Client({
    connection: connection,
    pipelineMode: false, // Explicitly non-pipeline
  })
  client.connect()
  client.connection.emit('connect')
  client.connection.emit('readyForQuery')

  // Create a query with a callback
  let capturedError = null
  const query = new Query('SELECT 1', [], function (err) {
    capturedError = err
  })

  // Set as active query (non-pipeline mode uses _activeQuery)
  client._activeQuery = query

  // Simulate error
  const errorMsg = new Error('Test error')
  client.connection.emit('errorMessage', errorMsg)

  process.nextTick(() => {
    assert.ok(capturedError, 'Query should have received an error')
    assert.equal(capturedError.message, 'Test error')
    // In non-pipeline mode, _activeQuery should be cleared
    assert.equal(client._activeQuery, null, '_activeQuery should be cleared in non-pipeline mode')
    done()
  })
})

suite.test('pipeline mode error - no pending query does not crash', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // No pending queries - _pendingQueries is empty

  // Simulate error - should not crash
  const errorMsg = new Error('Test error')
  client.connection.emit('errorMessage', errorMsg)

  process.nextTick(() => {
    // Should not crash and client should still be usable
    assert.ok(client._queryable, 'Client should still be queryable')
    done()
  })
})

suite.test('pipeline mode - _errorAllQueries rejects all pending queries', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Create multiple queries with callbacks to capture errors
  const errors = []
  const query1 = new Query('SELECT 1', [], function (err) {
    errors.push({ query: 'SELECT 1', error: err })
  })
  const query2 = new Query('SELECT 2', [], function (err) {
    errors.push({ query: 'SELECT 2', error: err })
  })
  const query3 = new Query('SELECT 3', [], function (err) {
    errors.push({ query: 'SELECT 3', error: err })
  })

  // Add queries to pending queries (simulating pipeline mode)
  client._pendingQueries.push(query1)
  client._pendingQueries.push(query2)
  client._pendingQueries.push(query3)

  // Simulate connection error that triggers _errorAllQueries
  const connectionError = new Error('Connection terminated unexpectedly')
  client._errorAllQueries(connectionError)

  // Verify all pending queries were cleared
  assert.equal(client._pendingQueries.length, 0, 'Pending queries should be cleared')

  // Wait for all errors to be processed (they are enqueued with process.nextTick)
  setTimeout(() => {
    assert.equal(errors.length, 3, 'All 3 queries should have received errors')
    errors.forEach((item) => {
      assert.equal(item.error.message, 'Connection terminated unexpectedly')
    })
    done()
  }, 10)
})

suite.test('pipeline mode - _errorAllQueries handles both pending and queued queries', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Create queries for both pending and queued
  const errors = []
  const pendingQuery = new Query('SELECT pending', [], function (err) {
    errors.push({ query: 'pending', error: err })
  })
  const queuedQuery = new Query('SELECT queued', [], function (err) {
    errors.push({ query: 'queued', error: err })
  })

  // Add to pending queries (already sent to server)
  client._pendingQueries.push(pendingQuery)
  // Add to query queue (not yet sent)
  client._queryQueue.push(queuedQuery)

  // Simulate connection error
  const connectionError = new Error('Connection lost')
  client._errorAllQueries(connectionError)

  // Verify both queues were cleared
  assert.equal(client._pendingQueries.length, 0, 'Pending queries should be cleared')
  assert.equal(client._queryQueue.length, 0, 'Query queue should be cleared')

  // Wait for all errors to be processed
  setTimeout(() => {
    assert.equal(errors.length, 2, 'Both queries should have received errors')
    done()
  }, 10)
})

suite.test('pipeline mode - connection end triggers _errorAllQueries for pending queries', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Handle the error event that will be emitted on unexpected connection end
  client.on('error', () => {
    // Expected - connection terminated unexpectedly
  })

  // Create a query with callback
  let capturedError = null
  const query = new Query('SELECT 1', [], function (err) {
    capturedError = err
  })

  // Add to pending queries
  client._pendingQueries.push(query)

  // Simulate unexpected connection end (this triggers _errorAllQueries internally)
  client.connection.emit('end')

  // Wait for error to be processed
  setTimeout(() => {
    assert.ok(capturedError, 'Query should have received an error')
    assert.ok(capturedError.message.includes('Connection terminated'), 'Error should indicate connection termination')
    assert.equal(client._pendingQueries.length, 0, 'Pending queries should be cleared')
    done()
  }, 10)
})

// Multi-statement validation tests (Requirement 6.2)
suite.test('pipeline mode - rejects multi-statement query with callback', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Submit a multi-statement query with callback
  let capturedError = null
  client.query('SELECT 1; SELECT 2', function (err) {
    capturedError = err
  })

  process.nextTick(() => {
    assert.ok(capturedError, 'Should have received an error')
    assert.equal(capturedError.message, 'Multiple SQL statements are not allowed in pipeline mode')
    done()
  })
})

suite.test('pipeline mode - rejects multi-statement query with Promise', async function () {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Submit a multi-statement query (Promise-based)
  try {
    await client.query('SELECT 1; SELECT 2')
    assert.fail('Should have thrown an error')
  } catch (err) {
    assert.equal(err.message, 'Multiple SQL statements are not allowed in pipeline mode')
  }
})

suite.test('pipeline mode - allows single statement with trailing semicolon', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Submit a single statement with trailing semicolon - should be allowed
  client.query('SELECT 1;')

  // Verify query was added to pending queries (not rejected)
  assert.ok(client._pendingQueries.length > 0, 'Query should be added to pending queries')
  assert.equal(client._pendingQueries[0].text, 'SELECT 1;')
  done()
})

suite.test('pipeline mode - allows single statement without semicolon', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Submit a single statement without semicolon - should be allowed
  client.query('SELECT 1')

  // Verify query was added to pending queries (not rejected)
  assert.ok(client._pendingQueries.length > 0, 'Query should be added to pending queries')
  assert.equal(client._pendingQueries[0].text, 'SELECT 1')
  done()
})

suite.test('pipeline mode - rejects multi-statement query with config object', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Submit a multi-statement query using config object
  let capturedError = null
  client.query({ text: 'SELECT 1; SELECT 2' }, function (err) {
    capturedError = err
  })

  process.nextTick(() => {
    assert.ok(capturedError, 'Should have received an error')
    assert.equal(capturedError.message, 'Multiple SQL statements are not allowed in pipeline mode')
    done()
  })
})

suite.test('pipeline mode - rejects query with multiple statements and whitespace', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Submit a multi-statement query with whitespace
  let capturedError = null
  client.query('SELECT 1;   SELECT 2;  ', function (err) {
    capturedError = err
  })

  process.nextTick(() => {
    assert.ok(capturedError, 'Should have received an error')
    assert.equal(capturedError.message, 'Multiple SQL statements are not allowed in pipeline mode')
    done()
  })
})

suite.test('non-pipeline mode - allows multi-statement queries', function (done) {
  // Create a non-pipeline client
  const stream = createMockStream()
  const connection = new Connection({ stream: stream })
  connection.startup = function () {}
  connection.connect = function () {}
  connection.query = function () {}
  connection.parsedStatements = {}

  const client = new Client({
    connection: connection,
    pipelineMode: false, // Explicitly non-pipeline
  })
  client.connect()
  client.connection.emit('connect')
  client.connection.emit('readyForQuery')

  // Submit a multi-statement query - should be allowed in non-pipeline mode
  client.query('SELECT 1; SELECT 2')

  // Verify query was added to queue (not rejected)
  // In non-pipeline mode, the query becomes the active query
  assert.ok(client._activeQuery, 'Query should be set as active query')
  assert.equal(client._activeQuery.text, 'SELECT 1; SELECT 2')
  done()
})

// COPY operation rejection tests (Requirement 6.1)
suite.test('pipeline mode - rejects COPY operation with error', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Create a query with a callback to capture the error
  let capturedError = null
  const query = new Query('COPY test FROM STDIN', [], function (err) {
    capturedError = err
  })

  // Add query to pending queries (simulating what _pulseQueryQueue does)
  client._pendingQueries.push(query)

  // Simulate copyInResponse message from server
  client.connection.emit('copyInResponse', {})

  // Verify the error was passed to the query
  process.nextTick(() => {
    assert.ok(capturedError, 'Query should have received an error')
    assert.equal(capturedError.message, 'COPY operations are not supported in pipeline mode')
    done()
  })
})

suite.test('pipeline mode - COPY rejection does not affect connection', function (done) {
  const client = createPipelineClient()

  // Simulate connection ready
  client.connection.emit('readyForQuery')

  // Create a query with a callback
  const query = new Query('COPY test FROM STDIN', [], function () {})
  client._pendingQueries.push(query)

  // Simulate copyInResponse
  client.connection.emit('copyInResponse', {})

  process.nextTick(() => {
    // Verify client is still usable
    assert.ok(client._queryable, 'Client should still be queryable')
    assert.ok(!client._ended, 'Client should not be ended')
    done()
  })
})

suite.test('non-pipeline mode - allows COPY operations', function (done) {
  // Create a non-pipeline client
  const stream = createMockStream()
  const connection = new Connection({ stream: stream })
  connection.startup = function () {}
  connection.connect = function () {}
  connection.query = function () {}
  connection.parsedStatements = {}

  const client = new Client({
    connection: connection,
    pipelineMode: false, // Explicitly non-pipeline
  })
  client.connect()
  client.connection.emit('connect')
  client.connection.emit('readyForQuery')

  // Create a query with a callback
  let copyInResponseCalled = false
  const query = new Query('COPY test FROM STDIN', [], function () {})
  query.handleCopyInResponse = function () {
    copyInResponseCalled = true
  }

  // Set as active query (non-pipeline mode uses _activeQuery)
  client._activeQuery = query

  // Simulate copyInResponse
  client.connection.emit('copyInResponse', {})

  process.nextTick(() => {
    assert.ok(copyInResponseCalled, 'handleCopyInResponse should be called in non-pipeline mode')
    done()
  })
})
