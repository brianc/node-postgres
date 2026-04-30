import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'
import assert from 'node:assert'

describe('connection-pool-size', () => {
  const testPoolSize = function (max: number): void {
    it(`test ${max} queries executed on a pool rapidly`, async () => {
      const pool = new helper.pg.Pool({ max: 10 })

      let count = 0

      return new Promise<void>((resolve) => {
        for (let i = 0; i < max; i++) {
          pool.connect(function (err, client, release) {
            assert(!err)
            client.query('SELECT * FROM NOW()')
            client.query('select generate_series(0, 25)', function (err, result) {
              assert.strictEqual(result.rows.length, 26)
            })
            client.query('SELECT * FROM NOW()', (err) => {
              assert(!err)
              release()
              if (++count === max) {
                resolve()
                pool.end()
              }
            })
          })
        }
      })
    })
  }

  testPoolSize(1)

  testPoolSize(2)

  testPoolSize(40)

  testPoolSize(200)
})
