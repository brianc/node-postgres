'use strict'
const helper = require('../test-helper')
const assert = require('assert')
const vm = require('vm')
const suite = new helper.Suite()

suite.testAsync('Handle date objects as Date', async () => {
  // Create a valid timestamp
  const timestamp = Date.now()
  // Create cross-realm date with valid timestamp and immediately get its value
  const crossRealmDate = await vm.runInNewContext(`new Date(${timestamp})`)
  assert(!(crossRealmDate instanceof Date))
  // Extract the time value while it's still valid
  const crossRealmTime = crossRealmDate.getTime()
  // Create local dates from the timestamps
  const date = new Date(timestamp)
  const crossRealmDateLocal = new Date(crossRealmTime)
  const client = new helper.pg.Client()
  await client.connect()
  await client.query('CREATE TEMP TABLE foo(bar timestamptz, bar2 timestamptz)')
  // Use the local date objects, not the cross-realm one
  await client.query('INSERT INTO foo(bar, bar2) VALUES($1, $2)', [date, crossRealmDateLocal])
  const results = await client.query('SELECT * FROM foo')
  const row = results.rows[0]
  assert.deepStrictEqual(row.bar, date)
  assert.deepStrictEqual(row.bar2, date)
  await client.end()
})
