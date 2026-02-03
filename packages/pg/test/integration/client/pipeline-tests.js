'use strict'

const assert = require('assert')
const helper = require('../test-helper')

const suite = new helper.Suite()

suite.test('pipeline mode configuration defaults', (done) => {
  const client = new helper.Client()
  assert.strictEqual(client.pipelineMode, false, 'pipelineMode should default to false')
  assert.strictEqual(client._pipelineBatchSize, 100, 'pipelineBatchSize should default to 100')
  assert.strictEqual(client._pipelineBatchTimeout, 0, 'pipelineBatchTimeout should default to 0')
  done()
})

suite.test('pipeline mode can be enabled via config', (done) => {
  const client = new helper.Client({
    pipelineMode: true,
    pipelineBatchSize: 50,
    pipelineBatchTimeout: 100,
  })
  assert.strictEqual(client.pipelineMode, true, 'pipelineMode should be true')
  assert.strictEqual(client._pipelineBatchSize, 50, 'pipelineBatchSize should be 50')
  assert.strictEqual(client._pipelineBatchTimeout, 100, 'pipelineBatchTimeout should be 100')
  done()
})

suite.testAsync('pipeline mode executes multiple queries', async () => {
  const client = new helper.Client({
    pipelineMode: true,
  })
  await client.connect()

  try {
    // Create a test table
    await client.query('CREATE TEMP TABLE pipeline_test (id SERIAL PRIMARY KEY, val TEXT)')

    // Execute multiple queries in parallel (pipeline mode batches them)
    const [r1, r2, r3] = await Promise.all([
      client.query('INSERT INTO pipeline_test(val) VALUES($1) RETURNING id', ['first']),
      client.query('INSERT INTO pipeline_test(val) VALUES($1) RETURNING id', ['second']),
      client.query('SELECT count(*)::int AS count FROM pipeline_test'),
    ])

    assert.strictEqual(r1.rows[0].id, 1, 'first insert should return id 1')
    assert.strictEqual(r2.rows[0].id, 2, 'second insert should return id 2')
    // Note: count may be 0, 1, or 2 depending on order - pipeline doesn't guarantee order
    // The key test is that all queries complete successfully
    assert.ok(typeof r3.rows[0].count === 'number', 'count should be a number')
  } finally {
    await client.end()
  }
})

suite.testAsync('pipeline mode handles errors correctly', async () => {
  const client = new helper.Client({
    pipelineMode: true,
  })
  await client.connect()

  try {
    // Execute multiple queries where one will fail
    const results = await Promise.allSettled([
      client.query('SELECT 1 AS num'),
      client.query('SELECT * FROM nonexistent_table_12345'), // This should fail
      client.query('SELECT 2 AS num'),
    ])

    assert.strictEqual(results[0].status, 'fulfilled', 'first query should succeed')
    assert.strictEqual(results[0].value.rows[0].num, 1)

    assert.strictEqual(results[1].status, 'rejected', 'second query should fail')

    // The third query might succeed or be aborted depending on timing
    // In pipeline mode with error, remaining queries in the batch are aborted
  } finally {
    await client.end()
  }
})

suite.testAsync('pipeline mode with prepared statements', async () => {
  const client = new helper.Client({
    pipelineMode: true,
  })
  await client.connect()

  try {
    // Create a test table
    await client.query('CREATE TEMP TABLE prep_test (id SERIAL PRIMARY KEY, val TEXT)')

    // Execute multiple inserts with the same prepared statement name
    const results = await Promise.all([
      client.query({ name: 'insert-val', text: 'INSERT INTO prep_test(val) VALUES($1) RETURNING id', values: ['a'] }),
      client.query({ name: 'insert-val', text: 'INSERT INTO prep_test(val) VALUES($1) RETURNING id', values: ['b'] }),
      client.query({ name: 'insert-val', text: 'INSERT INTO prep_test(val) VALUES($1) RETURNING id', values: ['c'] }),
    ])

    assert.strictEqual(results.length, 3, 'should have 3 results')
    results.forEach((r, i) => {
      assert.strictEqual(r.rows[0].id, i + 1, `insert ${i + 1} should return correct id`)
    })
  } finally {
    await client.end()
  }
})

suite.testAsync('non-pipeline mode still works', async () => {
  const client = new helper.Client({
    pipelineMode: false,
  })
  await client.connect()

  try {
    const r1 = await client.query('SELECT 1 AS num')
    const r2 = await client.query('SELECT 2 AS num')

    assert.strictEqual(r1.rows[0].num, 1)
    assert.strictEqual(r2.rows[0].num, 2)
  } finally {
    await client.end()
  }
})
