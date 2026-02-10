'use strict'
const helper = require('./test-helper')
const suite = new helper.Suite()
const pg = helper.pg
const assert = require('assert')

suite.test('txStatus tracking', function (done) {
  const client = new pg.Client()
  client.connect(
    assert.success(function () {
      // Run a simple query to initialize txStatus
      client.query(
        'SELECT 1',
        assert.success(function () {
          // Test 1: Initial state after query (should be idle)
          assert.equal(client._txStatus, 'I', 'should start in idle state')

          // Test 2: BEGIN transaction
          client.query(
            'BEGIN',
            assert.success(function () {
              assert.equal(client._txStatus, 'T', 'should be in transaction state')

              // Test 3: COMMIT
              client.query(
                'COMMIT',
                assert.success(function () {
                  assert.equal(client._txStatus, 'I', 'should return to idle after commit')

                  client.end(done)
                })
              )
            })
          )
        })
      )
    })
  )
})

suite.test('txStatus error state', function (done) {
  const client = new pg.Client()
  client.connect(
    assert.success(function () {
      // Run a simple query to initialize txStatus
      client.query(
        'SELECT 1',
        assert.success(function () {
          client.query(
            'BEGIN',
            assert.success(function () {
              // Execute invalid SQL to trigger error state
              client.query('INVALID SQL SYNTAX', function (err) {
                assert(err, 'should receive error from invalid query')

                // Use setImmediate to allow ReadyForQuery message to be processed
                setImmediate(function () {
                  assert.equal(client._txStatus, 'E', 'should be in error state')

                  // Rollback to recover
                  client.query(
                    'ROLLBACK',
                    assert.success(function () {
                      assert.equal(client._txStatus, 'I', 'should return to idle after rollback from error')
                      client.end(done)
                    })
                  )
                })
              })
            })
          )
        })
      )
    })
  )
})
