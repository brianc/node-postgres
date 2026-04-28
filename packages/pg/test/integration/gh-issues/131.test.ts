import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'
import assert from 'node:assert'

describe('131', () => {
  const pg = helper.pg
  it('parsing array decimal results', () =>
    new Promise<void>((done) => {
      const pool = new pg.Pool()
      pool.connect(
        assert.calls(function (err, client, release) {
          assert(!err)
          client.query('CREATE TEMP TABLE why(names text[], numbors integer[], decimals double precision[])')
          client
            .query(
              new pg.Query(
                'INSERT INTO why(names, numbors, decimals) VALUES(\'{"aaron", "brian","a b c" }\', \'{1, 2, 3}\', \'{.1, 0.05, 3.654}\')'
              )
            )
            .on('error', console.log)
          client.query(
            'SELECT decimals FROM why',
            assert.success(function (result) {
              assert.lengthIs(result.rows[0].decimals, 3)
              assert.equal(result.rows[0].decimals[0], 0.1)
              assert.equal(result.rows[0].decimals[1], 0.05)
              assert.equal(result.rows[0].decimals[2], 3.654)
              release()
              pool.end(done)
            })
          )
        })
      )
    }))
})
