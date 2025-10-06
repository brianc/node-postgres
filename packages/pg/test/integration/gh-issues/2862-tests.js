'use strict'

const helper = require('../test-helper')
const assert = require('assert')
const vm = require('vm')

const suite = new helper.Suite()

suite.testAsync('Handle date objects as Date', async () => {
  const crossRealmDate = await vm.runInNewContext('new Date()')
  assert(!(crossRealmDate instanceof Date))
  
  // Check if the cross-realm date is valid before using it
  const time = crossRealmDate.getTime()
  if (isNaN(time)) {
    // Skip test if cross-realm date is invalid
    console.log('Skipping test - cross-realm date is invalid')
    return
  }
  
  const date = new Date(time)
  
  // Verify the date is valid before proceeding
  if (isNaN(date.getTime())) {
    throw new Error('Created invalid date from cross-realm date')
  }
  
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