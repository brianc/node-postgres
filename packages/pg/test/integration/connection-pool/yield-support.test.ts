import assert from 'node:assert'
import { describe, it } from 'vitest'
import helper from './_test-helper.ts'

describe('yield-support', () => {
  // Originally tested co.wrap(function*) — now exercised via plain async/await.
  it('async/await works with promises', async () => {
    const pool = new helper.pg.Pool()
    const client = await pool.connect()
    const res = (await client.query('SELECT $1::text as name', ['foo'])) as { rows: Array<{ name: string }> }
    assert.equal(res.rows[0].name, 'foo')

    let threw = false
    try {
      await client.query('SELECT LKDSJDSLKFJ')
    } catch {
      threw = true
    }
    assert(threw)
    client.release()
    await pool.end()
  })
})
