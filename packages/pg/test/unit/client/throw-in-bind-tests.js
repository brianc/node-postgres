'use strict'
const helper = require('./test-helper')
const Query = require('../../../lib/query')
const assert = require('assert')

const suite = new helper.Suite()

const bindError = new Error('TEST: Throw in bind')

const setupClient = function () {
  const client = helper.client()
  const con = client.connection
  const calls = { parse: 0, sync: 0, describe: 0, execute: 0, close: 0 }

  con.parse = function () {
    calls.parse++
  }
  con.bind = function () {
    throw bindError
  }
  con.describe = function () {
    calls.describe++
    assert.fail('describe should not be called when bind throws')
  }
  con.execute = function () {
    calls.execute++
    assert.fail('execute should not be called when bind throws')
  }
  con.close = function () {
    calls.close++
  }
  con.sync = function () {
    calls.sync++
  }

  return { client, con, calls }
}

suite.test('calls callback with error when bind throws', function (done) {
  const { client, con, calls } = setupClient()
  con.emit('readyForQuery')
  client.query(
    new Query({
      text: 'select $1',
      values: ['x'],
      callback: function (err) {
        assert.equal(err, bindError)
        assert.equal(calls.sync, 1, 'sync should be called once')
        assert.equal(calls.describe, 0, 'describe should not be called')
        assert.equal(calls.execute, 0, 'execute should not be called')
        done()
      },
    })
  )
})

suite.test('emits error event when bind throws (no callback)', function (done) {
  const { client, con, calls } = setupClient()
  con.emit('readyForQuery')
  const query = new Query({
    text: 'select $1',
    values: ['x'],
  })
  query.on('error', function (err) {
    assert.equal(err, bindError)
    assert.equal(calls.sync, 1, 'sync should be called once')
    done()
  })
  client.query(query)
})

suite.test('send close when bind throws', function (done) {
  const { client, con, calls } = setupClient()
  con.emit('readyForQuery')
  client.query(
    new Query({
      text: 'select $1',
      values: ['x'],
      callback: function (err) {
        assert.equal(err, bindError)
        assert.equal(calls.close, 1, 'close should be called')
        done()
      },
    })
  )
})
