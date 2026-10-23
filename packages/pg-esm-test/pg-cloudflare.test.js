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

  it('should stop listening without an error when end() closes the socket', async () => {
    const socket = new CloudflareSocket()
    let rejectRead
    socket._cfReader = {
      read: () =>
        new Promise((resolve, reject) => {
          rejectRead = reject
        }),
    }
    socket._cfSocket = {
      close: async () => rejectRead(new TypeError('This socket has been closed.')),
    }

    const listening = socket._listen()
    socket.end()

    await listening
  })

  it('should stop listening without an error when the read fails after the socket closed', async () => {
    const socket = new CloudflareSocket()
    let rejectRead
    socket._cfReader = {
      read: () =>
        new Promise((resolve, reject) => {
          rejectRead = reject
        }),
    }
    const underlyingSocket = { closed: Promise.resolve() }
    socket._cfSocket = underlyingSocket
    socket._addClosedHandler()

    const listening = socket._listen()
    await underlyingSocket.closed
    assert.equal(socket._cfSocket, null)
    rejectRead(new TypeError('This socket has been closed.'))

    await listening
  })

  it('should still fail listening when a read fails before end()', async () => {
    const socket = new CloudflareSocket()
    socket._cfReader = { read: () => Promise.reject(new Error('Network connection lost.')) }

    await assert.rejects(socket._listen(), /Network connection lost/)
  })
})
