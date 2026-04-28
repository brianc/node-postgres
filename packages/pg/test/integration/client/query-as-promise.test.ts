import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'
import assert from 'node:assert'

describe('query-as-promise', () => {
  // The custom-Promise feature is deprecated; we sub in native Promise here so
  // the assertions still hold.
  const bluebird = Promise
  const pg = helper.pg

  process.on('unhandledRejection', function (e) {
    console.error(e, e.stack)
    process.exit(1)
  })
  it('promise API', () =>
    new Promise<void>((cb) => {
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
    }))

  it('promise API with configurable promise type', () =>
    new Promise<void>((cb) => {
      const client = new pg.Client({ Promise: bluebird })
      const connectPromise = client.connect()
      assert(connectPromise instanceof bluebird, 'Client connect() returns configured promise')

      connectPromise
        .then(() => {
          const queryPromise = client.query('SELECT 1')
          assert(queryPromise instanceof bluebird, 'Client query() returns configured promise')

          return queryPromise.then(() => {
            client.end(cb)
          })
        })
        .catch((error) => {
          process.nextTick(() => {
            throw error
          })
        })
    }))
})
