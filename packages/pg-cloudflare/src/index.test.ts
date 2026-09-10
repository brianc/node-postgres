import assert from 'assert'

import { CloudflareSocket } from './index'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('CloudflareSocket', () => {
  it('closes an open socket and invokes the end callback', () => {
    const socket = new CloudflareSocket(false)
    let closeCalls = 0
    Object.assign(socket, {
      _cfSocket: {
        close: () => closeCalls++,
      },
    })

    let callbackCalls = 0
    socket.end(Buffer.alloc(0), 'utf8', (err) => {
      callbackCalls++
      assert.equal(err, undefined)
    })

    assert.equal(closeCalls, 1)
    assert.equal(callbackCalls, 1)
  })

  it('invokes the end callback after the closed handler clears the socket', async () => {
    const socket = new CloudflareSocket(false)
    const closed = deferred()
    let closeCalls = 0
    Object.assign(socket, {
      _cfSocket: {
        closed: closed.promise,
        close: () => closeCalls++,
      },
    })

    let closeEvents = 0
    socket.on('close', () => closeEvents++)
    socket._addClosedHandler()
    closed.resolve()
    await closed.promise

    let callbackCalls = 0
    assert.doesNotThrow(() => {
      socket.end(Buffer.alloc(0), 'utf8', (err) => {
        callbackCalls++
        assert.equal(err, undefined)
      })
    })

    assert.equal(closeCalls, 0)
    assert.equal(closeEvents, 1)
    assert.equal(callbackCalls, 1)
  })
})
