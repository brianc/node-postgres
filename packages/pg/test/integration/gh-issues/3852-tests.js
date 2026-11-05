'use strict'
const helper = require('../test-helper')
const assert = require('assert')
const suite = new helper.Suite()

// libpq does not report a FATAL error while no query is running
if (helper.args.native) {
  return
}

suite.test('not queryable error has the idle-in-transaction timeout as cause', async () => {
  const client = new helper.pg.Client(helper.config)
  const errors = []
  client.on('error', (err) => errors.push(err))
  const ended = new Promise((resolve) => client.once('end', resolve))
  await client.connect()
  await client.query("SET idle_in_transaction_session_timeout = '100ms'")
  await client.query('BEGIN')
  await ended

  const timeoutError = errors[0]
  assert.equal(timeoutError.code, '25P03')
  await assert.rejects(client.query('SELECT 1'), (err) => {
    assert.equal(err.message, 'Client has encountered a connection error and is not queryable')
    assert.strictEqual(err.cause, timeoutError)
    return true
  })
})
