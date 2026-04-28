import { describe, expect, it } from 'vitest'
import { CloudflareSocket } from '../src/empty.ts'

describe('pg-cloudflare empty fallback', () => {
  it('exports a CloudflareSocket class', () => {
    expect(typeof CloudflareSocket).toBe('function')
  })

  it('constructs a socket with sensible defaults', () => {
    const socket = new CloudflareSocket(false)
    expect(socket.ssl).toBe(false)
    expect(socket.writable).toBe(false)
    expect(socket.destroyed).toBe(false)
  })

  it('chainable no-op tuning methods return the same socket', () => {
    const socket = new CloudflareSocket(true)
    expect(socket.setNoDelay()).toBe(socket)
    expect(socket.setKeepAlive()).toBe(socket)
    expect(socket.ref()).toBe(socket)
    expect(socket.unref()).toBe(socket)
  })

  it('connect() rejects outside of a workerd runtime', async () => {
    const socket = new CloudflareSocket(false)
    await expect(socket.connect(5432, 'localhost')).rejects.toThrow(/workerd/)
  })

  it('destroy() flips the destroyed flag', () => {
    const socket = new CloudflareSocket(false)
    socket.destroy()
    expect(socket.destroyed).toBe(true)
  })
})
