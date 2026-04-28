import { afterAll, beforeAll, describe, it } from 'vitest'
import assert from 'node:assert'
import helper from './../_test-helper.ts'

describe('timezone', () => {
  const oldTz = process.env.TZ
  process.env.TZ = 'Europe/Berlin'

  const date = new Date()
  const pool = new helper.pg.Pool()
  let client: Parameters<Parameters<typeof pool.connect>[0]>[1]
  let release: () => void

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
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
        pool.end(() => {
          process.env.TZ = oldTz
          resolve()
        })
      })
  )

  it('timestamp without time zone', () =>
    new Promise<void>((cb, reject) => {
      client.query('SELECT CAST($1 AS TIMESTAMP WITHOUT TIME ZONE) AS "val"', [date], (err, result) => {
        try {
          assert(!err)
          assert.equal(result.rows[0].val.getTime(), date.getTime())
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

  it('timestamp with time zone', () =>
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
