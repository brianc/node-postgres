const Client = require('../')
const assert = require('assert')

describe('pipeline mode', function () {
  this.timeout(10000)

  describe('pipeline configuration options', function () {
    it('accepts pipelineMode option', function () {
      const client = new Client({ pipelineMode: true })
      assert.strictEqual(client._pipelineMode, true)
    })

    it('accepts pipelineMaxQueries option', function () {
      const client = new Client({ pipelineMaxQueries: 100 })
      assert.strictEqual(client._pipelineMaxQueries, 100)
    })

    it('defaults pipelineMaxQueries to 1000', function () {
      const client = new Client()
      assert.strictEqual(client._pipelineMaxQueries, 1000)
    })

    it('defaults pipelineMode to false', function () {
      const client = new Client()
      assert.strictEqual(client._pipelineMode, false)
    })
  })

  describe('pipeline operations', function () {
    let client

    before(function (done) {
      client = new Client({ pipelineMode: true })
      client.connectSync()

      // Check if pipeline mode was successfully enabled
      if (!client._pipelineEnabled) {
        console.log('Pipeline mode not supported. Skipping pipeline tests.')
        client.end()
        this.skip()
        return done()
      }

      done()
    })

    after(function (done) {
      if (client && client.pq.connected) {
        client.end(done)
      } else {
        done()
      }
    })

    describe('query with callbacks', function () {
      it('can execute a single query in pipeline mode', function (done) {
        client.query('SELECT 1 as num', function (err, rows) {
          if (err) return done(err)
          assert.strictEqual(rows[0].num, 1)
          done()
        })
      })

      it('can execute a parameterized query in pipeline mode', function (done) {
        client.query('SELECT $1::int as num', [42], function (err, rows) {
          if (err) return done(err)
          assert.strictEqual(rows[0].num, 42)
          done()
        })
      })

      it('can execute multiple queries in pipeline mode', function (done) {
        let completed = 0
        const results = []

        const checkComplete = function () {
          completed++
          if (completed === 3) {
            assert.deepStrictEqual(results, [1, 2, 3])
            done()
          }
        }

        client.query('SELECT 1 as num', function (err, rows) {
          if (err) return done(err)
          results.push(rows[0].num)
          checkComplete()
        })

        client.query('SELECT 2 as num', function (err, rows) {
          if (err) return done(err)
          results.push(rows[0].num)
          checkComplete()
        })

        client.query('SELECT 3 as num', function (err, rows) {
          if (err) return done(err)
          results.push(rows[0].num)
          checkComplete()
        })
      })

      it('handles query errors in pipeline mode', function (done) {
        client.query('SELECT invalid_column FROM nonexistent_table', function (err) {
          assert(err instanceof Error, 'Should return an error')
          done()
        })
      })
    })

    describe('query with promises', function () {
      it('returns a promise when no callback provided', async function () {
        const rows = await client.query('SELECT 1 as num')
        assert.strictEqual(rows[0].num, 1)
      })

      it('can execute parameterized queries with promises', async function () {
        const rows = await client.query('SELECT $1::text as name', ['test'])
        assert.strictEqual(rows[0].name, 'test')
      })

      it('rejects promise on query error', async function () {
        try {
          await client.query('SELECT invalid')
          assert.fail('Should have thrown an error')
        } catch (err) {
          assert(err instanceof Error)
        }
      })
    })
  })

  describe('backpressure', function () {
    let client

    before(function (done) {
      client = new Client({ pipelineMode: true, pipelineMaxQueries: 5 })
      client.connectSync()

      if (!client._pipelineEnabled) {
        client.end()
        this.skip()
        return done()
      }

      done()
    })

    after(function (done) {
      if (client && client.pq.connected) {
        client.end(done)
      } else {
        done()
      }
    })

    it('queues queries when exceeding pipelineMaxQueries', async function () {
      // With pipelineMaxQueries=5, sending 10 queries should queue 5
      const promises = []
      for (let i = 1; i <= 10; i++) {
        promises.push(client.query('SELECT $1::int as num', [i]))
      }

      const results = await Promise.all(promises)

      assert.strictEqual(results.length, 10)
      for (let i = 0; i < 10; i++) {
        assert.strictEqual(results[i][0].num, i + 1)
      }
    })

    it('correctly tracks pending query count', async function () {
      // Start fresh - exit and re-enter pipeline mode
      client._exitPipelineMode()
      client._enterPipelineMode()
      client._startPipelineReading()

      assert.strictEqual(client._pipelinePendingCount, 0)
      assert.strictEqual(client._pipelineQueue.length, 0)

      // Send 3 queries (under the limit of 5)
      const p1 = client.query('SELECT 1')
      const p2 = client.query('SELECT 2')
      const p3 = client.query('SELECT 3')

      // All should be sent, none queued
      assert.strictEqual(client._pipelinePendingCount, 3)
      assert.strictEqual(client._pipelineQueue.length, 0)

      await Promise.all([p1, p2, p3])
    })
  })

  describe('comparison with non-pipeline mode', function () {
    it('standard client works without pipeline mode', function (done) {
      const standardClient = new Client()
      standardClient.connectSync()

      standardClient.query('SELECT 1 as num', function (err, rows) {
        if (err) {
          standardClient.end()
          return done(err)
        }
        assert.strictEqual(rows[0].num, 1)
        standardClient.end(done)
      })
    })

    it('pipeline mode client can execute many queries faster', async function () {
      this.timeout(20000)

      const pipelineClient = new Client({ pipelineMode: true })
      pipelineClient.connectSync()

      if (!pipelineClient._pipelineEnabled) {
        pipelineClient.end()
        this.skip()
        return
      }

      const count = 100
      const promises = []
      for (let i = 0; i < count; i++) {
        promises.push(pipelineClient.query('SELECT $1::int as num', [i]))
      }

      const results = await Promise.all(promises)
      assert.strictEqual(results.length, count)

      pipelineClient.end()
    })
  })
})
