'use strict'
const assert = require('assert')
const helper = require('./test-helper')
const Query = require('../../../lib/query')

const suite = new helper.Suite()
const maxParameterCount = 0xffff
const errorMessage = `PostgreSQL supports a maximum of ${maxParameterCount} parameters, but ${
  maxParameterCount + 1
} were supplied`

suite.test('allows the maximum parameter count', function () {
  const client = helper.client()
  const query = new Query({
    text: 'select $1',
    values: new Array(maxParameterCount).fill(null),
  })

  const err = query.submit(client.connection)

  assert.equal(err, null)
  assert.equal(client.connection.parseMessages.length, 1)
  assert.equal(client.connection.bindMessages.length, 1)
  assert.equal(client.connection.syncCount, 1)
})

suite.test('rejects too many parameters before sending query messages', function (done) {
  const client = helper.client()
  const con = client.connection
  let callbackCalls = 0
  let queryReturned = false

  con.emit('readyForQuery')
  client.query(
    {
      text: 'select $1',
      values: new Array(maxParameterCount + 1),
    },
    function (err) {
      callbackCalls++
      assert.equal(queryReturned, true, 'the callback must be asynchronous')
      assert(err instanceof RangeError)
      assert.equal(err.message, errorMessage)
      assert.equal(con.parseMessages.length, 0)
      assert.equal(con.bindMessages.length, 0)
      assert.equal(con.syncCount, 0)

      client.query('select 1', function (err) {
        assert.ifError(err)
        assert.equal(callbackCalls, 1)
        done()
      })
      process.nextTick(function () {
        con.emit('readyForQuery')
      })
    }
  )
  queryReturned = true
})

suite.test('isolates an oversized query in pipeline mode', async function () {
  const client = helper.client({ pipeline: true })
  const con = client.connection
  con.emit('readyForQuery')

  const queries = [
    client.query('select 1'),
    client.query({ text: 'select $1', values: new Array(maxParameterCount + 1) }),
    client.query('select 2'),
  ]

  assert.deepStrictEqual(con.queries, ['select 1', 'select 2'])
  assert.equal(con.parseMessages.length, 0)
  assert.equal(con.bindMessages.length, 0)
  assert.equal(con.syncCount, 0)

  con.emit('readyForQuery')
  con.emit('readyForQuery')

  const results = await Promise.allSettled(queries)
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert(results[1].reason instanceof RangeError)
  assert.equal(results[1].reason.message, errorMessage)
  assert.equal(results[2].status, 'fulfilled')
})
