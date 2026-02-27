'use strict'
const helper = require('../test-helper')
const pg = helper.pg
const assert = require('assert')

process.on('unhandledRejection', function (e) {
  console.error(e, e.stack)
  process.exit(1)
})

const suite = new helper.Suite()

suite.test('maxResultSize limit triggers error', (cb) => {
  // Check if we're running with the native client
  const isNative = helper.args.native
  console.log(isNative ? 'Testing with native client' : 'Testing with JavaScript client')

  // Create a pool with a very small result size limit
  const pool = new pg.Pool({
    maxResultSize: 100, // Very small limit (100 bytes)
    ...helper.args,
  })

  let sizeExceededErrorSeen = false

  pool.on('error', (err) => {
    console.log('Pool error:', err.message, err.code)
  })

  pool
    .connect()
    .then((client) => {
      // Set up client error listener for error events
      client.on('error', (err) => {
        console.log('Client error event:', err.message, err.code)

        // If we get any size exceeded error, mark it
        if (err.code === 'RESULT_SIZE_EXCEEDED' || err.message === 'Query result size exceeded the configured limit') {
          sizeExceededErrorSeen = true
        }
      })

      return client
        .query('CREATE TEMP TABLE large_result_test(id SERIAL, data TEXT)')
        .then(() => {
          // Insert rows that will exceed the size limit when queried
          const insertPromises = []
          for (let i = 0; i < 20; i++) {
            // Each row will have enough data to eventually exceed our limit
            const data = 'x'.repeat(50)
            insertPromises.push(client.query('INSERT INTO large_result_test(data) VALUES($1)', [data]))
          }
          return Promise.all(insertPromises)
        })
        .then(() => {
          console.log('Running query that should exceed size limit...')

          return client
            .query('SELECT * FROM large_result_test')
            .then(() => {
              throw new Error('Query should have failed due to size limit')
            })
            .catch((err) => {
              console.log('Query error caught:', err.message, err.code)

              // Both implementations should throw an error with this code
              assert.equal(err.code, 'RESULT_SIZE_EXCEEDED', 'Error should have RESULT_SIZE_EXCEEDED code')

              // Give time for error events to propagate
              return new Promise((resolve) => setTimeout(resolve, 100)).then(() => {
                // Verify we saw the error event
                assert(sizeExceededErrorSeen, 'Should have seen the size exceeded error event')

                return client.query('DROP TABLE IF EXISTS large_result_test').catch(() => {
                  /* ignore cleanup errors */
                })
              })
            })
        })
        .then(() => {
          client.release()
          pool.end(cb)
        })
        .catch((err) => {
          console.error('Test error:', err.message)
          client.release()
          pool.end(() => cb(err))
        })
    })
    .catch((err) => {
      console.error('Connection error:', err.message)
      pool.end(() => cb(err))
    })
})

suite.test('results under maxResultSize limit work correctly', (cb) => {
  // Create a pool with a reasonably large limit
  const pool = new pg.Pool({
    maxResultSize: 10 * 1024, // 10KB is plenty for small results
    ...helper.args,
  })

  pool
    .connect()
    .then((client) => {
      return client
        .query('CREATE TEMP TABLE small_result_test(id SERIAL, data TEXT)')
        .then(() => {
          return client.query('INSERT INTO small_result_test(data) VALUES($1)', ['small_data'])
        })
        .then(() => {
          return client.query('SELECT * FROM small_result_test').then((result) => {
            assert.equal(result.rows.length, 1, 'Should get 1 row')
            assert.equal(result.rows[0].data, 'small_data', 'Data should match')

            return client.query('DROP TABLE small_result_test')
          })
        })
        .then(() => {
          client.release()
          pool.end(cb)
        })
        .catch((err) => {
          client.release()
          pool.end(() => cb(err))
        })
    })
    .catch((err) => {
      pool.end(() => cb(err))
    })
})
