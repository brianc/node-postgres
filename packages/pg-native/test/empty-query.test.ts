import assert from 'node:assert'
import { describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('empty query', () => {
  it('has field metadata in result', () =>
    new Promise<void>((resolve, reject) => {
      const client = new Client()
      client.connectSync()
      client.query('SELECT NOW() as now LIMIT 0', (err, rows, res) => {
        if (err) return reject(err)
        assert.equal((rows as unknown[]).length, 0)
        const r = res as { fields: unknown[] }
        assert(Array.isArray(r.fields))
        assert.equal(r.fields.length, 1)
        client.end(() => resolve())
      })
    }))
})
