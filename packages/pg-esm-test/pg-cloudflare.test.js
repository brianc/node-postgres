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

  it('should emit error then close when the underlying closed promise rejects', async () => {
    const socket = new CloudflareSocket()
    const cause = new Error('socket died')
    socket._cfSocket = { closed: Promise.reject(cause) }
    socket._addClosedHandler()

    const order = []
    const seen = await new Promise((resolve) => {
      socket.once('error', (error) => {
        order.push('error')
        resolve(error)
      })
      socket.once('close', () => order.push('close'))
    })

    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(seen, cause)
    assert.deepEqual(order, ['error', 'close'])
  })

  it('should emit close without error when the closed promise rejects after end()', async () => {
    const socket = new CloudflareSocket()
    let rejectClosed
    socket._cfSocket = {
      closed: new Promise((_, reject) => (rejectClosed = reject)),
      close: async () => {},
    }
    socket._cfWriter = { write: () => Promise.resolve() }
    socket._addClosedHandler()

    let errorEmitted = false
    socket.on('error', () => (errorEmitted = true))
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('close event was not emitted')), 100)
      socket.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
    })

    socket.end()
    rejectClosed(undefined)
    await closed
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(errorEmitted, false)
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
