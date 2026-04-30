import { describe, expect, it } from 'vitest'
import emptyDefault, { CloudflareSocket as EmptyCloudflareSocket } from '../src/empty.ts'
import { CloudflareSocket } from '../src/index.ts'

describe('pg-cloudflare empty fallback', () => {
  it('default export carries the CloudflareSocket constructor', () => {
    expect(typeof emptyDefault.CloudflareSocket).toBe('function')
  })

  it('named CloudflareSocket throws on connect outside workerd', async () => {
    const socket = new EmptyCloudflareSocket(false)
    await expect(socket.connect(5432, 'localhost')).rejects.toThrow(/workerd/)
  })

  it('chainable no-op tuning methods return the same socket', () => {
    const socket = new EmptyCloudflareSocket(true)
    expect(socket.setNoDelay()).toBe(socket)
    expect(socket.setKeepAlive()).toBe(socket)
    expect(socket.ref()).toBe(socket)
    expect(socket.unref()).toBe(socket)
  })
})

describe('pg-cloudflare workerd build', () => {
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
})
