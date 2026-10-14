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
    // the server answers the Sync with ReadyForQuery
    setImmediate(() => con.emit('readyForQuery'))
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

suite.test('calls callback exactly once when bind throws', function (done) {
  const { client, con } = setupClient()
  con.emit('readyForQuery')
  const results = []
  client.query(
    new Query({
      text: 'select $1',
      values: ['x'],
      callback: function (err, res) {
        results.push(err || res)
      },
    })
  )
  // the ReadyForQuery that answers the Sync must not call back a second time
  setTimeout(() => {
    assert.deepEqual(results, [bindError])
    done()
  }, 20)
})

suite.test('does not emit end after error when bind throws', function (done) {
  const { client, con } = setupClient()
  con.emit('readyForQuery')
  const events = []
  const query = new Query({
    text: 'select $1',
    values: ['x'],
  })
  query.on('error', (err) => events.push(err))
  query.on('end', () => events.push('end'))
  client.query(query)
  setTimeout(() => {
    assert.deepEqual(events, [bindError])
    done()
  }, 20)
})

suite.test('runs the next query after bind throws', function (done) {
  const { client, con } = setupClient()
  con.emit('readyForQuery')
  const order = []
  client.query(
    new Query({
      text: 'select $1',
      values: ['x'],
      callback: function (err) {
        order.push(err)
      },
    })
  )
  client.query(
    new Query({
      text: 'select 1',
      callback: function (err) {
        order.push(err || 'ok')
      },
    })
  )
  // ReadyForQuery for the second (simple) query
  setImmediate(() => setImmediate(() => con.emit('readyForQuery')))
  setTimeout(() => {
    assert.deepEqual(order, [bindError, 'ok'])
    done()
  }, 20)
})
