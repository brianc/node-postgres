import assert from 'node:assert'
import { describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('Custom type parser', () => {
  it('is used by client', () =>
    new Promise<void>((resolve, reject) => {
      const client = new Client({
        types: {
          getTypeParser: () => () => 'blah',
        },
      })
      client.connectSync()
      const rows = client.querySync('SELECT NOW() AS when') as Array<Record<string, unknown>>
      assert.equal(rows[0]!.when, 'blah')
      client.query('SELECT NOW() as when', (err, rs) => {
        if (err) return reject(err)
        const r = rs as Array<Record<string, unknown>>
        assert.equal(r[0]!.when, 'blah')
        client.end(() => resolve())
      })
    }))
})
