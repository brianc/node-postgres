import assert from 'node:assert'
import { describe, it } from 'node:test'
import { CloudflareSocket } from 'pg-cloudflare'
import 'pg-cloudflare/package.json' assert { type: 'json' }

describe('pg-cloudflare', () => {
  it('should export CloudflareSocket constructor', () => {
    assert.ok(new CloudflareSocket())
  })
})
