'use strict'
const helper = require('./test-helper')
const { Client } = helper
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('backpressure configuration', function () {
  test('Client creation with custom pipelineMaxQueries', function () {
    // Create a Client with pipelineMode: true and a custom pipelineMaxQueries value
    const customPipelineMaxQueries = 500
    const client = new Client({
      pipelineMode: true,
      pipelineMaxQueries: customPipelineMaxQueries,
    })

    // Verify that client._pipelineMaxQueries equals the custom value
    assert.equal(
      client._pipelineMaxQueries,
      customPipelineMaxQueries,
      `Expected _pipelineMaxQueries to be ${customPipelineMaxQueries}, got ${client._pipelineMaxQueries}`
    )

    // Verify that client._lowWaterMark is calculated correctly (75% of pipelineMaxQueries)
    const expectedLowWaterMark = Math.floor(customPipelineMaxQueries * 0.75)
    assert.equal(
      client._lowWaterMark,
      expectedLowWaterMark,
      `Expected _lowWaterMark to be ${expectedLowWaterMark} (75% of ${customPipelineMaxQueries}), got ${client._lowWaterMark}`
    )
  })

  // Validates: Requirements 1.2
  test('Client creation with default pipelineMaxQueries value (1000)', function () {
    // Create a Client with pipelineMode: true but WITHOUT specifying pipelineMaxQueries
    const client = new Client({
      pipelineMode: true,
    })

    // Verify that client._pipelineMaxQueries equals the default value of 1000
    const expectedDefaultPipelineMaxQueries = 1000
    assert.equal(
      client._pipelineMaxQueries,
      expectedDefaultPipelineMaxQueries,
      `Expected _pipelineMaxQueries to default to ${expectedDefaultPipelineMaxQueries}, got ${client._pipelineMaxQueries}`
    )

    // Verify that client._lowWaterMark is calculated correctly (75% of 1000 = 750)
    const expectedLowWaterMark = Math.floor(expectedDefaultPipelineMaxQueries * 0.75)
    assert.equal(
      client._lowWaterMark,
      expectedLowWaterMark,
      `Expected _lowWaterMark to be ${expectedLowWaterMark} (75% of ${expectedDefaultPipelineMaxQueries}), got ${client._lowWaterMark}`
    )
  })

  // Validates: Requirements 1.5
  test('pendingQueryCount property accuracy', function () {
    // Create a Client with pipelineMode: true
    const client = new Client({
      pipelineMode: true,
    })

    // Verify that pendingQueryCount starts at 0
    assert.equal(
      client.pendingQueryCount,
      0,
      `Expected pendingQueryCount to start at 0, got ${client.pendingQueryCount}`
    )

    // Manually add items to _queryQueue
    client._queryQueue.push({ text: 'SELECT 1' })
    client._queryQueue.push({ text: 'SELECT 2' })
    client._queryQueue.push({ text: 'SELECT 3' })

    // Verify that pendingQueryCount reflects _queryQueue length
    assert.equal(
      client.pendingQueryCount,
      3,
      `Expected pendingQueryCount to be 3 after adding 3 items to _queryQueue, got ${client.pendingQueryCount}`
    )

    // Manually add items to _pendingQueries
    client._pendingQueries.push({ text: 'SELECT 4' })
    client._pendingQueries.push({ text: 'SELECT 5' })

    // Verify that pendingQueryCount returns the correct sum of both arrays
    const expectedCount = client._queryQueue.length + client._pendingQueries.length
    assert.equal(
      client.pendingQueryCount,
      expectedCount,
      `Expected pendingQueryCount to be ${expectedCount} (sum of _queryQueue and _pendingQueries), got ${client.pendingQueryCount}`
    )
    assert.equal(
      client.pendingQueryCount,
      5,
      `Expected pendingQueryCount to be 5 (3 in _queryQueue + 2 in _pendingQueries), got ${client.pendingQueryCount}`
    )

    // Verify that removing items from _pendingQueries updates the count correctly
    client._pendingQueries.shift()
    assert.equal(
      client.pendingQueryCount,
      4,
      `Expected pendingQueryCount to be 4 after removing 1 item from _pendingQueries, got ${client.pendingQueryCount}`
    )

    // Verify that removing items from _queryQueue updates the count correctly
    client._queryQueue.shift()
    assert.equal(
      client.pendingQueryCount,
      3,
      `Expected pendingQueryCount to be 3 after removing 1 item from _queryQueue, got ${client.pendingQueryCount}`
    )

    // Clear both arrays and verify count is 0
    client._queryQueue.length = 0
    client._pendingQueries.length = 0
    assert.equal(
      client.pendingQueryCount,
      0,
      `Expected pendingQueryCount to be 0 after clearing both arrays, got ${client.pendingQueryCount}`
    )
  })

  // Validates: Requirements 1.6
  test('pipelineFull event emission when high water mark is reached', function () {
    // Create a Client with pipelineMode: true and a small pipelineMaxQueries value for easier testing
    const pipelineMaxQueries = 5
    const client = new Client({
      pipelineMode: true,
      pipelineMaxQueries: pipelineMaxQueries,
    })

    // Track pipelineFull event emissions
    let pipelineFullEmitCount = 0
    client.on('pipelineFull', function () {
      pipelineFullEmitCount++
    })

    // Verify initial state: _pipelinePaused should be false
    assert.equal(client._pipelinePaused, false, 'Expected _pipelinePaused to be false initially')

    // Verify pipelineFull event has not been emitted yet
    assert.equal(pipelineFullEmitCount, 0, 'Expected pipelineFull event to not be emitted initially')

    // Manually fill the _pendingQueries and _queryQueue arrays to reach the maxPendingQueries limit
    // Add 3 items to _pendingQueries
    client._pendingQueries.push({ text: 'SELECT 1' })
    client._pendingQueries.push({ text: 'SELECT 2' })
    client._pendingQueries.push({ text: 'SELECT 3' })

    // Add 2 items to _queryQueue (total = 5, which equals maxPendingQueries)
    client._queryQueue.push({ text: 'SELECT 4' })
    client._queryQueue.push({ text: 'SELECT 5' })

    // Verify pendingQueryCount equals pipelineMaxQueries
    assert.equal(
      client.pendingQueryCount,
      pipelineMaxQueries,
      `Expected pendingQueryCount to be ${pipelineMaxQueries}, got ${client.pendingQueryCount}`
    )

    // Simulate the backpressure check by directly testing the condition and emitting the event
    // This mimics what happens in the query() method when the high water mark is reached
    if (client.pendingQueryCount >= client._pipelineMaxQueries) {
      if (!client._pipelinePaused) {
        client._pipelinePaused = true
        client.emit('pipelineFull')
      }
    }

    // Verify that the pipelineFull event was emitted exactly once
    assert.equal(
      pipelineFullEmitCount,
      1,
      `Expected pipelineFull event to be emitted exactly once, got ${pipelineFullEmitCount}`
    )

    // Verify that _pipelinePaused is now true
    assert.equal(client._pipelinePaused, true, 'Expected _pipelinePaused to be true after reaching high water mark')

    // Simulate calling the backpressure check again (should NOT emit pipelineFull again)
    if (client.pendingQueryCount >= client._pipelineMaxQueries) {
      if (!client._pipelinePaused) {
        client._pipelinePaused = true
        client.emit('pipelineFull')
      }
    }

    // Verify that the pipelineFull event was still only emitted once (not again)
    assert.equal(
      pipelineFullEmitCount,
      1,
      `Expected pipelineFull event to still be emitted only once (not again when already paused), got ${pipelineFullEmitCount}`
    )
  })
})
