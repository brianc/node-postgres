import { describe, it } from 'vitest'
import assert from 'node:assert'
import helper from '../_test-helper.ts'

describe('787', () => {
  it('787', async () => {
    const pool = new helper.pg.Pool()

    pool.connect(function (err, client) {
      const q = {
        name: 'This is a super long query name just so I can test that an error message is properly spit out to console.error without throwing an exception or anything',
        text: 'SELECT NOW()',
      }
      client.query(q, function () {
        client.end()
      })
    })
  })
})
