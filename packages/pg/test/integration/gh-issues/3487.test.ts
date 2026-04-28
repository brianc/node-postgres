import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'
import assert from 'node:assert'

describe('3487', () => {
  it('allows you to switch between format modes for arrays', async () => {
    const client = new helper.pg.Client()
    await client.connect()

    const r1 = await client.query({
      text: 'SELECT CAST($1 AS INT[]) as a',
      values: [[1, 2, 8]],
      binary: false,
    })
    assert.deepEqual(r1.rows[0].a, [1, 2, 8])

    const r2 = await client.query({
      text: 'SELECT CAST($1 AS INT[]) as a',
      values: [[4, 5, 6]],
      binary: true,
    })
    assert.deepEqual(r2.rows[0].a, [4, 5, 6])

    await client.end()
  })
})
