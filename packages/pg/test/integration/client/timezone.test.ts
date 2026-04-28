import { afterAll, beforeAll, describe, it } from 'vitest'
import assert from 'node:assert'
import helper from './../_test-helper.ts'

// pg-types 4 changes two relevant behaviours vs 2.x:
//  1. `TIMESTAMP WITHOUT TIME ZONE` (oid 1114) is now interpreted as UTC
//     (the parser appends 'Z') instead of local-tz, so a tz-shifted
//     `process.env.TZ` no longer changes the resulting Date's time.
//  2. `DATE` (oid 1082) is no longer auto-parsed — the raw string comes
//     back. To keep the legacy "DATE → Date" coverage we install a
//     small custom parser on this client.
import * as types from 'pg-types'

describe('timezone', () => {
  const date = new Date()
  const pool = new helper.pg.Pool()
  let client: Parameters<Parameters<typeof pool.connect>[0]>[1]
  let release: () => void

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        types.setTypeParser(1082, (value) => new Date(value as string))
        pool.connect((err, c, done) => {
          if (err) return reject(err)
          if (!c) return reject(new Error('no client'))
          client = c
          release = done
          resolve()
        })
      })
  )

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        release()
        pool.end(() => resolve())
      })
  )

  it('timestamp without time zone roundtrips through Date', () =>
    new Promise<void>((cb, reject) => {
      client.query('SELECT CAST($1 AS TIMESTAMP WITHOUT TIME ZONE) AS "val"', [date], (err, result) => {
        try {
          assert(!err)
          assert(result.rows[0].val instanceof Date)
          cb()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('date comes out as a date', async () => {
    const { rows } = await client.query('SELECT NOW()::DATE AS date')
    assert(rows[0].date instanceof Date)
  })

  it('timestamp with time zone matches the input wall-clock time', () =>
    new Promise<void>((cb, reject) => {
      client.query('SELECT CAST($1 AS TIMESTAMP WITH TIME ZONE) AS "val"', [date], (err, result) => {
        try {
          assert(!err)
          assert.equal(result.rows[0].val.getTime(), date.getTime())
          cb()
        } catch (e) {
          reject(e)
        }
      })
    }))
})
