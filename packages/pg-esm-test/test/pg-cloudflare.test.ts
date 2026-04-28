import { describe, expect, it } from 'vitest'
import { CloudflareSocket } from 'pg-cloudflare'

describe('pg-cloudflare', () => {
  it('exports CloudflareSocket constructor', () => {
    expect(new CloudflareSocket(false)).toBeTruthy()
  })
})
