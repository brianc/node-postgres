'use strict'

const helper = require('./test-helper')
const pg = helper.pg
const assert = require('assert')

const suite = new helper.Suite()

suite.test('pipeline mode basic functionality', (cb) => {
  const client = new pg.Client(helper.config)
  client.connect((err) => {
    if (err) return cb(err)

    // Initially not in pipeline mode
    assert.equal(client.pipelineStatus(), 'PIPELINE_OFF')
    assert.equal(client.pipelining, false)

    // Enable pipeline mode
    client.pipelining = true
    assert.equal(client.pipelineStatus(), 'PIPELINE_ON')
    assert.equal(client.pipelining, true)

    // Disable pipeline mode
    client.pipelining = false
    assert.equal(client.pipelineStatus(), 'PIPELINE_OFF')
    assert.equal(client.pipelining, false)

    client.end(cb)
  })
})

suite.test('cannot enable pipeline before connection', (cb) => {
  const client = new pg.Client(helper.config)

  try {
    client.pipelining = true
    cb(new Error('Should have thrown error'))
  } catch (err) {
    assert.equal(err.message, 'Cannot enable pipelining before connection is established')
    cb()
  }
})

suite.test('pipeline mode with multiple queries', (cb) => {
  const client = new pg.Client(helper.config)
  client.connect((err) => {
    if (err) return cb(err)

    client.pipelining = true

    const results = []
    let completed = 0

    // Send multiple queries in pipeline mode
    client.query({ text: 'SELECT 1 as num' }, (err, res) => {
      if (err) return cb(err)
      results[0] = res.rows[0].num
      completed++
      if (completed === 3) checkResults()
    })

    client.query({ text: 'SELECT 2 as num' }, (err, res) => {
      if (err) return cb(err)
      results[1] = res.rows[0].num
      completed++
      if (completed === 3) checkResults()
    })

    client.query({ text: 'SELECT 3 as num' }, (err, res) => {
      if (err) return cb(err)
      results[2] = res.rows[0].num
      completed++
      if (completed === 3) checkResults()
    })

    function checkResults() {
      assert.equal(results[0], 1)
      assert.equal(results[1], 2)
      assert.equal(results[2], 3)
      client.end(cb)
    }
  })
})

suite.test('pipeline mode rejects simple query protocol', (cb) => {
  const client = new pg.Client(helper.config)
  client.connect((err) => {
    if (err) return cb(err)

    client.pipelining = true

    try {
      client.query('SELECT 1', (err, res) => {
        // This should not be called
        cb(new Error('Simple query should have been rejected'))
      })
    } catch (err) {
      assert(err.message.includes('Simple query protocol is not allowed in pipeline mode'))
      client.end(cb)
    }
  })
})

suite.test('pipeline mode rejects multiple SQL commands', (cb) => {
  const client = new pg.Client(helper.config)
  client.connect((err) => {
    if (err) return cb(err)

    client.pipelining = true

    try {
      client.query({ text: 'SELECT 1; SELECT 2;' }, (err, res) => {
        // This should not be called
        cb(new Error('Multiple SQL commands should have been rejected'))
      })
    } catch (err) {
      assert(err.message.includes('Multiple SQL commands in a single query are not allowed in pipeline mode'))
      client.end(cb)
    }
  })
})

suite.test('pipeline mode with parameterized queries', (cb) => {
  const client = new pg.Client(helper.config)
  client.connect((err) => {
    if (err) return cb(err)

    client.pipelining = true

    const results = []
    let completed = 0

    // Send parameterized queries in pipeline mode
    client.query({ text: 'SELECT $1::int as num', values: [10] }, (err, res) => {
      if (err) return cb(err)
      results[0] = res.rows[0].num
      completed++
      if (completed === 2) checkResults()
    })

    client.query({ text: 'SELECT $1::text as str', values: ['hello'] }, (err, res) => {
      if (err) return cb(err)
      results[1] = res.rows[0].str
      completed++
      if (completed === 2) checkResults()
    })

    function checkResults() {
      assert.equal(results[0], 10)
      assert.equal(results[1], 'hello')
      client.end(cb)
    }
  })
})

suite.test('pipeline mode performance benefit', (cb) => {
  const client = new pg.Client(helper.config)
  client.connect((err) => {
    if (err) return cb(err)

    const numQueries = 10

    // Test without pipeline mode
    const startNormal = Date.now()
    let normalCompleted = 0

    function runNormalQueries() {
      for (let i = 0; i < numQueries; i++) {
        client.query({ text: 'SELECT $1::int as num', values: [i] }, (err, res) => {
          if (err) return cb(err)
          normalCompleted++
          if (normalCompleted === numQueries) {
            const normalTime = Date.now() - startNormal
            runPipelineQueries(normalTime)
          }
        })
      }
    }

    function runPipelineQueries(normalTime) {
      client.pipelining = true
      const startPipeline = Date.now()
      let pipelineCompleted = 0

      for (let i = 0; i < numQueries; i++) {
        client.query({ text: 'SELECT $1::int as num', values: [i] }, (err, res) => {
          if (err) return cb(err)
          pipelineCompleted++
          if (pipelineCompleted === numQueries) {
            const pipelineTime = Date.now() - startPipeline

            // Pipeline should be faster or at least not significantly slower
            // In real network conditions with latency, pipeline would show more benefit
            console.log(`Normal mode: ${normalTime}ms, Pipeline mode: ${pipelineTime}ms`)
            assert(normalTime <= pipelineTime)

            client.end(cb)
          }
        })
      }
    }

    runNormalQueries()
  })
})

module.exports = suite
