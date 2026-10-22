'use strict'
const helper = require('./test-helper')
const Query = require('../../../lib/query')
const assert = require('assert')

const suite = new helper.Suite()

suite.test('marks client not queryable when an active query gets a FATAL error', function (done) {
  const client = helper.client()
  assert.equal(client._queryable, true)
  client.connection.emit('readyForQuery')

  client.query(
    new Query({
      text: 'select pg_sleep(30)',
      callback: function (err) {
        assert.equal(err.severity, 'FATAL')
        assert.equal(client._queryable, false)
        done()
      },
    })
  )

  client.connection.emit('errorMessage', { severity: 'FATAL', code: '57P01' })
})

suite.test('keeps client queryable for a non-FATAL error', function (done) {
  const client = helper.client()
  client.connection.emit('readyForQuery')

  client.query(
    new Query({
      text: 'select 1',
      callback: function (err) {
        assert.equal(err.severity, 'ERROR')
        assert.equal(client._queryable, true)
        done()
      },
    })
  )

  client.connection.emit('errorMessage', { severity: 'ERROR', code: '42601' })
})
