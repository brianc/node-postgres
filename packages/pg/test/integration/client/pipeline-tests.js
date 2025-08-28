'use strict'

const helper = require('../test-helper')
const { Client } = require('../../../')
const assert = require('assert')

const suite = new helper.Suite()

suite.test('pipelining property can be set and retrieved', (cb) => {
  const client = new Client(helper.config)
  // Initially false
  assert.strictEqual(client.pipelining, false)
  client.connect((err) => {
    if (err) return cb(err)
    // Can be set to true after connection
    client.pipelining = true
    assert.strictEqual(client.pipelining, true)
    // Can be set back to false
    client.pipelining = false
    assert.strictEqual(client.pipelining, false)
    client.end(cb)
  })
})

suite.test('cannot enable pipelining before connection', (cb) => {
  const client = new Client(helper.config)
  try {
    client.pipelining = true
    assert.fail('Should have thrown error')
  } catch (err) {
    assert.strictEqual(err.message, 'Cannot enable pipelining mode before connection is established')
    cb()
  }
})

suite.test('pipelining mode allows multiple parameterized queries', (cb) => {
  const client = new Client(helper.config)
  client.connect((err) => {
    if (err) return cb(err)
    client.pipelining = true
    let completed = 0
    const results = []
    // Send multiple queries in pipeline mode
    client.query('SELECT $1::text as message', ['Hello'], (err, result) => {
      if (err) return cb(err)
      results[0] = result
      completed++
      if (completed === 3) checkResults()
    })
    client.query('SELECT $1::int as number', [42], (err, result) => {
      if (err) return cb(err)
      results[1] = result
      completed++
      if (completed === 3) checkResults()
    })
    client.query('SELECT $1::text as greeting', ['World'], (err, result) => {
      if (err) return cb(err)
      results[2] = result
      completed++
      if (completed === 3) checkResults()
    })
    function checkResults() {
      assert.strictEqual(results[0].rows[0].message, 'Hello')
      assert.strictEqual(results[1].rows[0].number, 42)
      assert.strictEqual(results[2].rows[0].greeting, 'World')
      client.end(cb)
    }
  })
})

suite.test('pipelining mode rejects simple queries', (cb) => {
  const client = new Client(helper.config)
  client.connect((err) => {
    if (err) return cb(err)
    client.pipelining = true
    client.query('SELECT 1', (err, result) => {
      assert.strictEqual(
        err.message,
        'Simple query protocol is not allowed in pipeline mode. Use parameterized queries.'
      )
      client.end(cb)
    })
  })
})

suite.test('pipelining mode rejects multi-statement queries', (cb) => {
  const client = new Client(helper.config)
  client.connect((err) => {
    if (err) return cb(err)
    client.pipelining = true
    client.query('SELECT $1; SELECT $2', [1, 2], (err, result) => {
      assert.strictEqual(err.message, 'Multiple SQL commands in a single query are not allowed in pipeline mode')
      client.end(cb)
    })
  })
})
module.exports = suite
