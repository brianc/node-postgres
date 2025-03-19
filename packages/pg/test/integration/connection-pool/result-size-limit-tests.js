'use strict'

const helper = require('../test-helper')
const pg = helper.pg
var assert = require('assert')


const suite = new helper.Suite()

// Test that the pool respects the maxResultSize option
suite.test('pool respects maxResultSize option', (done) => {
  const pool = new pg.Pool({
    ...helper.args,
    maxResultSize: 1024, // very small limit
  })

  pool.on('error', (err) => {
    if (err.code === 'RESULT_SIZE_EXCEEDED') {
      return done()
    }
  })

  const largeQuery = `
    SELECT generate_series(1, 1000) as num,
           repeat('x', 100) as data
  `

  pool.query(largeQuery, (err) => {
    if (!err) {
      return done(new Error('Expected query to fail with size limit error'))
    }

    if (err.code !== 'RESULT_SIZE_EXCEEDED') {
      return done(new Error(`Expected RESULT_SIZE_EXCEEDED error but got: ${err.message} (${err.code})`))
    }
  })
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

