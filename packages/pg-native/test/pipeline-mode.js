const Client = require('../')
const assert = require('assert')

describe('pipeline mode', function () {
  this.timeout(10000)

  describe('pipelineModeSupported', function () {
    it('returns a boolean', function (done) {
      const client = Client()
      client.connect(function (err) {
        if (err) return done(err)
        const supported = client.pipelineModeSupported()
        assert.strictEqual(typeof supported, 'boolean')
        client.end(done)
      })
    })
  })

  describe('pipelineMode property', function () {
    it('returns false when not enabled', function (done) {
      const client = Client()
      client.connect(function (err) {
        if (err) return done(err)
        assert.strictEqual(client.pipelineMode, false)
        client.end(done)
      })
    })

    it('returns true when enabled', function (done) {
      const client = Client({ pipelineMode: true })
      // Check property before connect
      assert.strictEqual(client.pipelineMode, true)

      client.connect(function (err) {
        // If pipeline mode is not supported, skip the test
        if (err && err.message.includes('Pipeline mode is not supported')) {
          console.log('Pipeline mode not supported, skipping test')
          return done()
        }
        if (err) return done(err)
        assert.strictEqual(client.pipelineMode, true)
        client.end(done)
      })
    })
  })

  // Skip pipeline operation tests if not supported
  describe('pipeline operations', function () {
    let supported = false

    before(function (done) {
      const testClient = Client()
      testClient.connect(function (err) {
        if (err) return done(err)
        supported = testClient.pipelineModeSupported()
        const serverVersion = testClient.pq.serverVersion()
        testClient.end(function () {
          if (!supported) {
            console.log('Pipeline mode not supported by client library. Skipping pipeline tests.')
          } else if (serverVersion < 140000) {
            console.log(
              `Pipeline mode not supported by server (version: ${serverVersion}, requires 140000+). Skipping pipeline tests.`
            )
            supported = false
          }
          done()
        })
      })
    })

    beforeEach(function () {
      if (!supported) {
        this.skip()
      }
    })

    it('can execute a simple query in pipeline mode', function (done) {
      const client = Client({ pipelineMode: true })
      client.connect(function (err) {
        if (err) return done(err)
        client.query('SELECT 1 as num', function (err, rows) {
          if (err) {
            client.end()
            return done(err)
          }
          assert.strictEqual(rows.length, 1)
          assert.strictEqual(rows[0].num, 1)
          client.end(done)
        })
      })
    })

    it('can execute a query with parameters in pipeline mode', function (done) {
      const client = Client({ pipelineMode: true })
      client.connect(function (err) {
        if (err) return done(err)
        client.query('SELECT $1::int as num', [42], function (err, rows) {
          if (err) {
            client.end()
            return done(err)
          }
          assert.strictEqual(rows.length, 1)
          assert.strictEqual(rows[0].num, 42)
          client.end(done)
        })
      })
    })

    it('can execute multiple queries concurrently', function (done) {
      const client = Client({ pipelineMode: true })
      client.connect(function (err) {
        if (err) return done(err)

        let completed = 0
        const results = []

        const checkDone = function () {
          completed++
          if (completed === 3) {
            // All queries completed
            assert.strictEqual(results.length, 3)
            // Results should be in order
            results.sort((a, b) => a.index - b.index)
            assert.strictEqual(results[0].value, 1)
            assert.strictEqual(results[1].value, 2)
            assert.strictEqual(results[2].value, 3)
            client.end(done)
          }
        }

        client.query('SELECT $1::int as num', [1], function (err, rows) {
          if (err) return done(err)
          results.push({ index: 0, value: rows[0].num })
          checkDone()
        })

        client.query('SELECT $1::int as num', [2], function (err, rows) {
          if (err) return done(err)
          results.push({ index: 1, value: rows[0].num })
          checkDone()
        })

        client.query('SELECT $1::int as num', [3], function (err, rows) {
          if (err) return done(err)
          results.push({ index: 2, value: rows[0].num })
          checkDone()
        })
      })
    })

    it('handles query errors in pipeline mode', function (done) {
      const client = Client({ pipelineMode: true })
      client.connect(function (err) {
        if (err) return done(err)
        // Division by zero error
        client.query('SELECT 1/0', function (err, rows) {
          assert(err instanceof Error, 'Should return an error')
          assert(err.message.includes('division by zero'), 'Error should mention division by zero')
          client.end(done)
        })
      })
    })

    it('rejects multi-statement queries in pipeline mode', function (done) {
      const client = Client({ pipelineMode: true })
      client.connect(function (err) {
        if (err) return done(err)
        client.query('SELECT 1; SELECT 2', function (err) {
          assert(err instanceof Error, 'Should return an error')
          assert(err.message.includes('Multi-statement'), 'Error should mention multi-statement')
          client.end(done)
        })
      })
    })

    it('rejects COPY operations in pipeline mode', function (done) {
      const client = Client({ pipelineMode: true })
      client.connect(function (err) {
        if (err) return done(err)
        client.query('COPY (SELECT 1) TO STDOUT', function (err) {
          assert(err instanceof Error, 'Should return an error')
          assert(err.message.includes('COPY'), 'Error should mention COPY')
          client.end(done)
        })
      })
    })

    it('is still usable after an error', function (done) {
      const client = Client({ pipelineMode: true })
      client.connect(function (err) {
        if (err) return done(err)
        // First, cause an error
        client.query('SELECT 1/0', function (err) {
          assert(err instanceof Error, 'Should return an error')
          // Then, execute a valid query
          client.query('SELECT 1 as num', function (err, rows) {
            if (err) {
              client.end()
              return done(err)
            }
            assert.strictEqual(rows.length, 1)
            assert.strictEqual(rows[0].num, 1)
            client.end(done)
          })
        })
      })
    })

    it('waits for pending queries on end', function (done) {
      const client = Client({ pipelineMode: true })
      client.connect(function (err) {
        if (err) return done(err)

        let queryCompleted = false

        client.query('SELECT pg_sleep(0.1), 1 as num', function (err, rows) {
          if (err) return done(err)
          queryCompleted = true
          assert.strictEqual(rows[0].num, 1)
        })

        // Call end immediately - it should wait for the query
        client.end(function () {
          assert.strictEqual(queryCompleted, true, 'Query should have completed before end')
          done()
        })
      })
    })
  })

  describe('error handling when not supported', function () {
    it('returns error when pipeline mode not supported', function (done) {
      // Create a client with a mock pq that doesn't support pipeline mode
      const client = Client({ pipelineMode: true })

      // Override pipelineModeSupported to return false
      const originalSupported = client.pipelineModeSupported.bind(client)
      client.pipelineModeSupported = function () {
        return false
      }

      client.connect(function (err) {
        // Restore original function
        client.pipelineModeSupported = originalSupported

        assert(err instanceof Error, 'Should return an error')
        assert(
          err.message.includes('Pipeline mode is not supported'),
          'Error should mention pipeline mode not supported'
        )
        done()
      })
    })
  })
})
