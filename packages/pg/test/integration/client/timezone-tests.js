'use strict'
var helper = require('./../test-helper')
const assert = require('assert')

var oldTz = process.env.TZ
process.env.TZ = 'Europe/Berlin'

var date = new Date()

const pool = new helper.pg.Pool()
const suite = new helper.Suite()

pool.connect(function (err, client, done) {
  assert(!err)

  suite.test('timestamp without time zone', function (cb) {
    client.query('SELECT CAST($1 AS TIMESTAMP WITHOUT TIME ZONE) AS "val"', [date], function (err, result) {
      assert(!err)
      assert.equal(result.rows[0].val.getTime(), date.getTime())
      cb()
    })
  })

  suite.testAsync('date comes out as a date', async function () {
    const { rows } = await client.query('SELECT NOW()::DATE AS date')
    assert(rows[0].date instanceof Date)
  })

  suite.test('timestamp with time zone', function (cb) {
    client.query('SELECT CAST($1 AS TIMESTAMP WITH TIME ZONE) AS "val"', [date], function (err, result) {
      assert(!err)
      assert.equal(result.rows[0].val.getTime(), date.getTime())

      done()
      pool.end(cb)
      process.env.TZ = oldTz
    })
  })
})
