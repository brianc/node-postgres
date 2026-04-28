import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'
import * as types from 'pg-types' // 1700 = numericOID

import type { PoolClient, ReleaseCallback } from 'pg-pool'

describe('huge-numeric', () => {
  it('huge-numeric', async () => {
    const pool = new helper.pg.Pool()

    pool.connect(
      assert.success(function (client: PoolClient, done: ReleaseCallback) {
        types.setTypeParser(1700, function () {
          return 'yes'
        })
        types.setTypeParser(1700, 'binary', function () {
          return 'yes'
        })
        const bignum = '294733346389144765940638005275322203805'
        client.query('CREATE TEMP TABLE bignumz(id numeric)')
        client.query('INSERT INTO bignumz(id) VALUES ($1)', [bignum])
        client.query(
          'SELECT * FROM bignumz',
          assert.success(function (result: { rows: Array<{ id: string }> }) {
            assert.equal(result.rows[0].id, 'yes')
            done()
            pool.end()
          })
        )
      })
    )
  })
})
