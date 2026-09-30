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

  it('should call the write(data, callback) callback exactly once', async () => {
    const socket = new CloudflareSocket()
    socket._cfWriter = { write: () => Promise.resolve() }

    let resolve
    const promise = new Promise((resolvePromise) => {
      resolve = resolvePromise
    })
    let called = false
    socket.write(Buffer.from('x'), (error) => {
      assert.ifError(error)
      assert(!called)
      called = true
      resolve()
    })

    await promise
  })

  it('should emit error when a write without a callback fails', async () => {
    const socket = new CloudflareSocket()
    const writeError = new Error('write failed')
    socket._cfWriter = { write: () => Promise.reject(writeError) }

    const emitted = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('error event was not emitted')), 100)
      socket.once('error', (error) => {
        clearTimeout(timer)
        resolve(error)
      })
      socket.write(Buffer.from('x'))
    })

    assert.equal(await emitted, writeError)
  })

  it('should report a failed write to the callback rather than emitting error', async () => {
    const socket = new CloudflareSocket()
    const writeError = new Error('write failed')
    socket._cfWriter = { write: () => Promise.reject(writeError) }
    socket.once('error', () => assert.fail('error event was emitted despite a callback'))

    const reported = await new Promise((resolve) => socket.write(Buffer.from('x'), resolve))

    assert.equal(reported, writeError)
  })

  it('should emit close when ending a socket whose closed promise never settles', async () => {
    const socket = new CloudflareSocket()
    socket._cfSocket = {
      closed: new Promise(() => {}),
      close: async () => {},
    }
    socket._addClosedHandler()

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('close event was not emitted')), 100)
      socket.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.end()
    })
  })
})
