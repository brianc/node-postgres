'use strict'

const helper = require('../test-helper')
const pg = helper.pg
var assert = require('assert')

const suite = new helper.Suite()

suite.testAsync('large result triggers error', async () => {
  const pool = new pg.Pool({
    ...helper.args,
    maxResultSize: 1024, // very small limit
  })

  const largeQuery = `
    SELECT generate_series(1, 1000) as num,
           repeat('x', 100) as data
  `

  pool.on('error', (err) => {
    assert.equal(err.code, 'RESULT_SIZE_EXCEEDED')
  })

  try {
    await pool.query(largeQuery)
    throw new Error('should have raised RESULT_SIZE_EXCEEDED error')
  } catch (err) {
    assert.equal(err.code, 'RESULT_SIZE_EXCEEDED')
  }
})

suite.test('pool query works with adequate maxResultSize', (done) => {
  // Create a pool with a much larger limit
  const pool = new pg.Pool({
    ...helper.args,
    maxResultSize: 100 * 1024,
  })

  // Use a very simple query that returns a single value
  const simpleQuery = `SELECT 1 as num`

  // This should succeed
  pool.query(simpleQuery, (err, result) => {
    if (err) {
      return done(err)
    }

    // Verify we got the expected result
    assert.deepEqual(result.rows, [{ num: 1 }])
    // Test passed, clean up
    pool.end(done)
  })
})
