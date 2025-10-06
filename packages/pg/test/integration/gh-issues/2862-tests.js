'use strict'
const helper = require('../test-helper')
const assert = require('assert')
const vm = require('vm')
const suite = new helper.Suite()

suite.testAsync('Handle date objects as Date', async () => {
  // Create a valid date timestamp first
  const timestamp = Date.now()
  
  // Create cross-realm date with the valid timestamp
  const crossRealmDate = await vm.runInNewContext(`new Date(${timestamp})`)
  assert(!(crossRealmDate instanceof Date))
  
  // Create local date with same timestamp
  const date = new Date(timestamp)
  
  const client = new helper.pg.Client()
  await client.connect()
  await client.query('CREATE TEMP TABLE foo(bar timestamptz, bar2 timestamptz)')
  await client.query('INSERT INTO foo(bar, bar2) VALUES($1, $2)', [date, crossRealmDate])
  const results = await client.query('SELECT * FROM foo')
  const row = results.rows[0]
  assert.deepStrictEqual(row.bar, date)
  assert.deepStrictEqual(row.bar2, date)
  await client.end()
})