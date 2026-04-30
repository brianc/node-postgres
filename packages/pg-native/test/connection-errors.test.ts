import assert from 'node:assert'
import { describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('connection errors', () => {
  it('raise error events', () =>
    new Promise<void>((resolve) => {
      const client = new Client()
      client.connectSync()
      client.query('SELECT pg_terminate_backend(pg_backend_pid())', () => {
        // ignore - we expect the error to come through the 'error' event
      })
      client.on('error', (err) => {
        assert(err)
        assert.strictEqual(client.pq.resultErrorFields().sqlState, '57P01')
        client.end()
        resolve()
      })
    }))
})
