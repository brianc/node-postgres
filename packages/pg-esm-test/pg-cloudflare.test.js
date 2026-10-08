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

  it('should emit the destroy error before close', async () => {
    const socket = new CloudflareSocket()
    socket._cfSocket = {
      closed: new Promise(() => {}),
      close: async () => {},
    }
    socket._addClosedHandler()

    const events = []
    const error = new Error('timeout expired')
    socket.on('error', (emitted) => events.push(emitted))
    await new Promise((resolve) => {
      socket.once('close', () => {
        events.push('close')
        resolve()
      })
      socket.destroy(error)
    })

    assert.ok(socket.destroyed)
    assert.deepEqual(events, [error, 'close'])
  })

  it('should not emit an error when destroyed without one', async () => {
    const socket = new CloudflareSocket()
    socket._cfSocket = {
      closed: new Promise(() => {}),
      close: async () => {},
    }
    socket._addClosedHandler()

    const errors = []
    socket.on('error', (error) => errors.push(error))
    await new Promise((resolve) => {
      socket.once('close', resolve)
      socket.destroy()
    })

    assert.deepEqual(errors, [])
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
