import { describe, it } from 'vitest'
import helper from './../_test-helper.ts'
import assert from 'node:assert'

// allow skipping of this test via env var for local testing when you
// don't have SSL set up. With vitest's collect-time semantics we have to
// skip the suite at the describe level — `return` inside describe doesn't
// short-circuit registration the way it did under mocha.
describe.skipIf(process.env.PGTESTNOSSL)('2085', () => {
  it('it should connect over ssl', async () => {
    const ssl = false
      ? 'require'
      : {
          rejectUnauthorized: false,
        }
    const client = new helper.pg.Client({ ssl })
    await client.connect()
    const { rows } = await client.query('SELECT NOW()')
    assert.strictEqual(rows.length, 1)
    await client.end()
  })

  it('it should fail with self-signed cert error w/o rejectUnauthorized being passed', async () => {
    const ssl = false ? 'verify-ca' : {}
    const client = new helper.pg.Client({ ssl })
    try {
      await client.connect()
    } catch (e) {
      return
    }
    throw new Error('this test should have thrown an error due to self-signed cert')
  })
})
