"use strict"
var helper = require('./../test-helper')
var assert = require('assert')

const suite = new helper.Suite()

suite.testAsync('All queries should return a result array', async () => {
  const pool = new helper.pg.Pool()
  const client = await pool.connect()
  const cancledPromise = client.query('SELECT pg_sleep(100000)')
    .then(() => {
      throw new Error('this should not resolve because query is cancled')
    })
    .catch(err => {
      return err
    })
  await client.cancelActiveQuery()
  const err = await cancledPromise
  assert(err instanceof Error)
  // make sure client is still usable
  const { rows } = await client.query('SELECT 1 as "foo"')
  assert.strictEqual(rows.length, 1)
  assert.deepStrictEqual(rows[0], { foo: 1 })
  await client.end()
})
