import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'
import assert from 'node:assert'

import type { PoolClient, ReleaseCallback } from 'pg-pool'

describe('parse-int-8', () => {
  const pg = helper.pg

  const pool = new pg.Pool(helper.config)
  it('ability to turn on and off parser', function () {
    if ((helper.args as { binary?: boolean }).binary) return false
    pool.connect(
      assert.success(function (client: PoolClient, done: ReleaseCallback) {
        ;(pg.defaults as { parseInt8?: boolean }).parseInt8 = true
        client.query('CREATE TEMP TABLE asdf(id SERIAL PRIMARY KEY)')
        client.query(
          'SELECT COUNT(*) as "count", \'{1,2,3}\'::bigint[] as array FROM asdf',
          assert.success(function (res) {
            assert.strictEqual(0, res.rows[0].count)
            assert.strictEqual(1, res.rows[0].array[0])
            assert.strictEqual(2, res.rows[0].array[1])
            assert.strictEqual(3, res.rows[0].array[2])
            ;(pg.defaults as { parseInt8?: boolean }).parseInt8 = false
            client.query(
              'SELECT COUNT(*) as "count", \'{1,2,3}\'::bigint[] as array FROM asdf',
              assert.success(function (res) {
                done()
                assert.strictEqual('0', res.rows[0].count)
                assert.strictEqual('1', res.rows[0].array[0])
                assert.strictEqual('2', res.rows[0].array[1])
                assert.strictEqual('3', res.rows[0].array[2])
                pool.end()
              })
            )
          })
        )
      })
    )
  })
})
