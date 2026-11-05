'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('not queryable error keeps the error that made the client unqueryable as cause', function (done) {
  const client = helper.client()
  client.connection.emit('readyForQuery')

  const fatal = new Error('terminating connection due to idle-in-transaction timeout')
  fatal.severity = 'FATAL'
  fatal.code = '25P03'

  client.on('error', function (err) {
    assert.strictEqual(err, fatal)
  })
  client.connection.emit('errorMessage', fatal)

  client.query('SELECT 1', function (err) {
    assert.equal(err.message, 'Client has encountered a connection error and is not queryable')
    assert.strictEqual(err.cause, fatal)
    assert.equal(err.cause.code, '25P03')
    done()
  })
})
