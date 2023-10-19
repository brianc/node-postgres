'use strict'
const helper = require('../test-helper')
var assert = require('assert')
const suite = new helper.Suite()

// https://github.com/brianc/node-postgres/issues/3062
suite.testAsync('result fields with the same name should pick the last value', async () => {
  const client = new helper.pg.Client()
  await client.connect()

  const {
    rows: [shouldBeNullRow],
  } = await client.query('SELECT NULL AS test, 10 AS test, NULL AS test')
  assert.equal(shouldBeNullRow.test, null)

  const {
    rows: [shouldBeTwelveRow],
  } = await client.query('SELECT NULL AS test, 10 AS test, 12 AS test')
  assert.equal(shouldBeTwelveRow.test, 12)

  const {
    rows: [shouldBeAbcRow],
  } = await client.query(`SELECT NULL AS test, 10 AS test, 12 AS test, 'ABC' AS test`)
  assert.equal(shouldBeAbcRow.test, 'ABC')

  await client.end()
})
