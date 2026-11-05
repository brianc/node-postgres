import assert from 'assert'
import { once } from 'events'
import { describe, it } from 'node:test'
import pg from 'pg'
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

  it('writes the extended query protocol messages together without changing the bytes', () => {
    const socket = new CloudflareSocket()
    const writes = []
    socket.writable = true
    socket._cfWriter = {
      write(data) {
        writes.push(data)
        return Promise.resolve()
      },
    }

    const separateWrites = []
    const plainStream = { writable: true, write: (data) => separateWrites.push(data) }
    const query = { text: 'select $1::int', values: [42] }
    assert.equal(new pg.Query(query).submit(new pg.Connection({ stream: plainStream })), null)
    assert.equal(new pg.Query(query).submit(new pg.Connection({ stream: socket })), null)

    assert.equal(separateWrites.length, 5)
    assert.deepStrictEqual(writes, [Buffer.concat(separateWrites)])
  })

  it('flushes on the last uncork and completes buffered callbacks in write order', async () => {
    const socket = new CloudflareSocket()
    const writes = []
    const completed = []
    socket._cfWriter = {
      write(data) {
        writes.push(data)
        return Promise.resolve()
      },
    }

    socket.cork()
    socket.cork()
    const finished = new Promise((resolve) => {
      socket.write(Uint8Array.of(0xaa), (err) => completed.push([1, err]))
      socket.write('ff', 'hex', (err) => {
        completed.push([2, err])
        resolve()
      })
    })
    socket.uncork()
    assert.deepStrictEqual(writes, [])
    assert.deepStrictEqual(completed, [])

    socket.uncork()
    socket.uncork()
    await finished
    assert.deepStrictEqual(writes, [Buffer.from([0xaa, 0xff])])
    assert.deepStrictEqual(completed, [
      [1, undefined],
      [2, undefined],
    ])
  })

  it('reports a failed batch to each buffered write callback', async () => {
    const socket = new CloudflareSocket()
    const error = new Error('write failed')
    socket._cfWriter = { write: () => Promise.reject(error) }

    socket.cork()
    const first = new Promise((resolve) => socket.write('first', resolve))
    const second = new Promise((resolve) => socket.write('second', resolve))
    socket.uncork()
    assert.deepStrictEqual(await Promise.all([first, second]), [error, error])
  })

  it('flushes buffered data before closing, even without an end payload', async () => {
    const socket = new CloudflareSocket()
    let finishWrite
    const writes = []
    let closed = false
    socket._cfWriter = {
      write(data) {
        writes.push(data)
        return new Promise((resolve) => {
          finishWrite = resolve
        })
      },
    }
    socket._cfSocket = {
      close: async () => {
        closed = true
      },
    }

    socket.cork()
    socket.cork()
    socket.write('pending')
    const close = once(socket, 'close')
    socket.end()
    assert.deepStrictEqual(writes, [Buffer.from('pending')])
    assert.equal(closed, false)
    finishWrite()
    await close
    assert.equal(closed, true)
  })

  it('discards buffered data on destroy and completes its callbacks with the reason', async () => {
    const socket = new CloudflareSocket()
    socket._cfWriter = { write: () => assert.fail('destroy must not send buffered data') }
    socket._cfSocket = { close: async () => {} }

    const reason = new Error('socket destroyed')
    socket.cork()
    const result = new Promise((resolve) => socket.write('pending', resolve))
    const close = once(socket, 'close')
    socket.destroy(reason)
    socket.uncork()

    assert.equal(await result, reason)
    await close
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
