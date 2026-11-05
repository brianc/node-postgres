'use strict'
const helper = require('./../test-helper')
const Client = require('./../../lib/native')
const suite = new helper.Suite()
const assert = require('assert')

suite.test('not queryable error keeps the error that made the client unqueryable as cause', async function () {
  const client = new Client(helper.config)
  await client.connect()

  const connectionError = new Error('server closed the connection unexpectedly')
  client.on('error', function (err) {
    assert.strictEqual(err, connectionError)
  })
  client.native.emit('error', connectionError)

  await assert.rejects(client.query('SELECT 1'), function (err) {
    assert.equal(err.message, 'Client has encountered a connection error and is not queryable')
    assert.strictEqual(err.cause, connectionError)
    return true
  })
  await client.end()
})
