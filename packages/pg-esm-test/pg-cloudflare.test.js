import assert from 'assert'
import { describe, it } from 'node:test'
import { CloudflareSocket } from 'pg-cloudflare'

describe('pg-cloudflare', () => {
  it('should export CloudflareSocket constructor', () => {
    assert.ok(new CloudflareSocket())
  })

  it('should safely end after the underlying socket has closed', async () => {
    const socket = new CloudflareSocket()
    const underlyingSocket = { closed: Promise.resolve() }
    socket._cfSocket = underlyingSocket
    socket._addClosedHandler()

    await underlyingSocket.closed
    assert.equal(socket._cfSocket, null)

    assert.doesNotThrow(() => socket.end())
  })

  it('should emit close when the underlying close call resolves', async () => {
    const socket = new CloudflareSocket()
    const underlyingSocket = {
      closed: new Promise(() => {}),
      close: () => Promise.resolve(),
    }
    socket._cfSocket = underlyingSocket
    socket._addClosedHandler()

    const close = new Promise((resolve) => socket.once('close', resolve))
    socket.end()

    await close
    assert.equal(socket._cfSocket, null)
  })

  it('should support the write(data, callback) overload', async () => {
    const socket = new CloudflareSocket()
    socket._cfWriter = { write: () => Promise.resolve() }

    await new Promise((resolve) => socket.write(Buffer.from('x'), resolve))
  })

  it('should emit close only once when both close signals resolve', async () => {
    const socket = new CloudflareSocket()
    const underlyingSocket = {
      closed: Promise.resolve(),
      close: () => Promise.resolve(),
    }
    socket._cfSocket = underlyingSocket
    socket._addClosedHandler()

    let closeCount = 0
    socket.on('close', () => closeCount++)
    socket.end()

    await underlyingSocket.closed
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(closeCount, 1)
  })
})
