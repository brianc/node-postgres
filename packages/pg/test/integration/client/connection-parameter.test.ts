import { describe, it } from 'vitest'
import assert from 'node:assert'
import helper from '../_test-helper.ts'

describe('connection-parameter', () => {
  const { Client } = helper.pg

  it('it sends options', async () => {
    const client = new Client({
      options: '--default_transaction_isolation=serializable',
    })
    await client.connect()
    const { rows } = await client.query('SHOW default_transaction_isolation')
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].default_transaction_isolation, 'serializable')
    await client.end()
  })
})
