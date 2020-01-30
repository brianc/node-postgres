

"use strict"
var helper = require('./../test-helper')
var assert = require('assert')

const suite = new helper.Suite()

suite.testAsync('it should connect over ssl', async () => {
  const client = new helper.pg.Client({ ssl: 'require'})
  await client.connect()
  const { rows } = await client.query('SELECT NOW()')
  assert.strictEqual(rows.length, 1)
  await client.end()
})
