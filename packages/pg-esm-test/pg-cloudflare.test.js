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
})
