'use strict'
var helper = require('./test-helper')
var assert = require('assert')
const { Client } = helper.pg
const suite = new helper.Suite()

// Just verify the test infrastructure works
suite.test('sanity check', function (done) {
  var client = new Client(helper.args)
  client.connect(assert.success(function () {
    client.query('SELECT 1 as num', assert.success(function(result) {
      assert.equal(result.rows.length, 1)
      client.end(done)
    }))
  }))
})

// Basic test to check if the _maxResultSize property is passed to Connection
suite.test('client passes maxResultSize to connection', function (done) {
  var client = new Client({
    ...helper.args,
    maxResultSize: 1024 * 1024 // 1MB limit
  })
  
  client.connect(assert.success(function () {
    assert.equal(client.connection._maxResultSize, 1024 * 1024, 
                 'maxResultSize should be passed to the connection')
    client.end(done)
  }))
})

// Check if the correct attachListeners method is being used based on maxResultSize
suite.test('connection uses correct listener implementation', function (done) {
  var client = new Client({
    ...helper.args,
    maxResultSize: 1024 * 1024 // 1MB limit
  })
  
  client.connect(assert.success(function () {
    // Just a simple check to see if our methods exist on the connection object
    assert(typeof client.connection._attachListenersStandard === 'function',
           'Standard listener method should exist')
    assert(typeof client.connection._attachListenersWithSizeLimit === 'function',
           'Size-limiting listener method should exist')
    client.end(done)
  }))
})

// Test that small result sets complete successfully with maxResultSize set
suite.test('small result with maxResultSize', function (done) {
  var client = new Client({
    ...helper.args,
    maxResultSize: 1024 * 1024 // 1MB limit
  })
  
  client.connect(assert.success(function () {
    client.query('SELECT generate_series(1, 10) as num', assert.success(function(result) {
      assert.equal(result.rows.length, 10)
      client.end(done)
    }))
  }))
})

// Test for large result size
// Using a separate test to avoid issue with callback being called twice
suite.testAsync('large result triggers error', async () => {
  const client = new Client({
    ...helper.args,
    maxResultSize: 500 // Very small limit
  })

  // Setup error handler
  const errorPromise = new Promise(resolve => {
    client.on('error', err => {
      assert.equal(err.message, 'Query result size exceeded the configured limit')
      assert.equal(err.code, 'RESULT_SIZE_EXCEEDED')
      resolve()
    })
  })

  await client.connect()
  
  // Start the query but don't await it (it will error)
  const queryPromise = client.query('SELECT repeat(\'x\', 1000) as data FROM generate_series(1, 100)')
    .catch(err => {
      // We expect this to error out, silence the rejection
      return null
    })
  
  // Wait for error event
  await errorPromise
  
  // Make sure the query is done before we end
  await queryPromise
  
  // Clean up
  await client.end().catch(() => {}) // Ignore errors during cleanup
}) 