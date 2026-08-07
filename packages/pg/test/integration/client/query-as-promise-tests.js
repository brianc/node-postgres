'use strict'
const helper = require('../test-helper')
const pg = helper.pg
const assert = require('assert')

process.on('unhandledRejection', function (e) {
  console.error(e, e.stack)
  process.exit(1)
})

const suite = new helper.Suite()

suite.test('promise API', (cb) => {
  const pool = new pg.Pool()
  pool.connect().then((client) => {
    client
      .query('SELECT $1::text as name', ['foo'])
      .then(function (result) {
        assert.equal(result.rows[0].name, 'foo')
        return client
      })
      .then(function (client) {
        client.query('ALKJSDF').catch(function (e) {
          assert(e instanceof Error)
          client.query('SELECT 1 as num').then(function (result) {
            assert.equal(result.rows[0].num, 1)
            client.release()
            pool.end(cb)
          })
        })
      })
  })
})

// The `Promise` constructor option was removed in pg@9.0; a client always uses the global Promise
// now, and passing one is ignored rather than honoured.
suite.test('a supplied promise type is ignored', (cb) => {
  class NotAPromise extends Promise {}

  const client = new pg.Client({ Promise: NotAPromise })
  const connectPromise = client.connect()
  assert(connectPromise instanceof Promise, 'Client connect() returns a promise')
  assert(!(connectPromise instanceof NotAPromise), 'Client connect() ignores a supplied promise type')

  connectPromise
    .then(() => {
      const queryPromise = client.query('SELECT 1')
      assert(queryPromise instanceof Promise, 'Client query() returns a promise')
      assert(!(queryPromise instanceof NotAPromise), 'Client query() ignores a supplied promise type')

      return queryPromise.then(() => {
        client.end(cb)
      })
    })
    .catch((error) => {
      process.nextTick(() => {
        throw error
      })
    })
})
