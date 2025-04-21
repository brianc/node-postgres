import assert from 'node:assert'
import { describe, it } from 'node:test'
import { CloudflareSocket } from 'pg-cloudflare'

describe('pg-pool', () => {
  it('should export CloudflareSocket constructor', () => {
    assert.ok(new CloudflareSocket())
  })
})
