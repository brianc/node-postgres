import { describe, it } from 'vitest'
import helper from './../_test-helper.ts'
import assert from 'node:assert'

describe('2056', () => {
  it('All queries should return a result array', () =>
    new Promise<void>((done) => {
      const client = new helper.pg.Client()
      client.connect()
      const promises = []
      promises.push(client.query('CREATE TEMP TABLE foo(bar TEXT)'))
      promises.push(client.query('INSERT INTO foo(bar) VALUES($1)', ['qux']))
      promises.push(client.query('SELECT * FROM foo WHERE bar = $1', ['foo']))
      Promise.all(promises).then((results) => {
        results.forEach((res) => {
          assert(Array.isArray(res.fields))
          assert(Array.isArray(res.rows))
        })
        client.end(done)
      })
    }))
})
