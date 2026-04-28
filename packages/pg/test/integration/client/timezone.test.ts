import { describe, it } from 'vitest'
import helper from './../_test-helper.ts'
import assert from 'node:assert'

describe('timezone', () => {
  const oldTz = process.env.TZ
  process.env.TZ = 'Europe/Berlin'

  const date = new Date()

  const pool = new helper.pg.Pool()
  pool.connect(function (err, client, done) {
    assert(!err)

    it('timestamp without time zone', () =>
      new Promise<void>((cb) => {
        client.query('SELECT CAST($1 AS TIMESTAMP WITHOUT TIME ZONE) AS "val"', [date], function (err, result) {
          assert(!err)
          assert.equal(result.rows[0].val.getTime(), date.getTime())
          cb()
        })
      }))

    it('date comes out as a date', async function () {
      const { rows } = await client.query('SELECT NOW()::DATE AS date')
      assert(rows[0].date instanceof Date)
    })

    it('timestamp with time zone', () =>
      new Promise<void>((cb) => {
        client.query('SELECT CAST($1 AS TIMESTAMP WITH TIME ZONE) AS "val"', [date], function (err, result) {
          assert(!err)
          assert.equal(result.rows[0].val.getTime(), date.getTime())

          done()
          pool.end(cb)
          process.env.TZ = oldTz
        })
      }))
  })
})
