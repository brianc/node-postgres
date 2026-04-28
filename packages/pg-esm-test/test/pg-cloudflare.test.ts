import { describe, it, expect } from 'vitest'
import { CloudflareSocket } from 'pg-cloudflare'

describe('pg-cloudflare', () => {
  it('exports CloudflareSocket constructor', () => {
    expect(new CloudflareSocket(false)).toBeTruthy()
  })
})
