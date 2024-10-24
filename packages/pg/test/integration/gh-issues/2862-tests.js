'use strict'
var helper = require('./../test-helper')
var assert = require('assert')
var util = require('util')
var vm = require('vm');

const suite = new helper.Suite()

suite.test('Handle date objects as Date', async (done) => {
  const date = new Date();
  const dateObj = await vm.runInNewContext('new Date()');
  assert(!(dateObj instanceof Date))
  assert(util.types.isDate(dateObj))
  const client = new helper.pg.Client()
  client.connect()

  await client.query('CREATE TEMP TABLE foo(bar TIMESTAMP, bar2 TIMESTAMP)')
  await client.query('INSERT INTO foo(bar, bar2) VALUES($1, $2)', [date, dateObj])
  const results = await client.query('SELECT * FROM foo')
  const row = results.rows[0]
  const dbDate = row.bar
  const dbDateObj = row.bar2
  assert.deepEqual(dbDate, date)
  assert.deepEqual(dbDateObj, dateObj)
  await client.end()
  done()
})
