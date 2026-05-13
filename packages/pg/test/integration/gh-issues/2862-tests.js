'use strict'

const helper = require('../test-helper')
const assert = require('assert')
const vm = require('vm')

const suite = new helper.Suite()

suite.test('Handle date objects as Date', async () => {
  const crossRealmDate = await vm.runInNewContext('new Date()')
  assert(!(crossRealmDate instanceof Date))
  const date = new Date(crossRealmDate.getTime())
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
