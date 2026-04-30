import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'
import assert from 'node:assert'

describe('507', () => {
  const pg = helper.pg

  it('parsing array results', () =>
    new Promise<void>((cb) => {
      const pool = new pg.Pool()
      pool.connect(
        assert.success(function (client, done) {
          client.query('CREATE TEMP TABLE test_table(bar integer, "baz\'s" integer)')
          client.query('INSERT INTO test_table(bar, "baz\'s") VALUES(1, 1), (2, 2)')
          client.query(
            'SELECT * FROM test_table',
            function (err: Error | undefined, res: { rows: Array<Record<string, number>> }) {
              assert.equal(res.rows[0]["baz's"], 1)
              assert.equal(res.rows[1]["baz's"], 2)
              done()
              pool.end(cb)
            }
          )
        })
      )
    }))
})
