import { EventEmitter } from 'events'
import assert from 'assert'
import Pool from '../'

describe('events', function () {
  it('emits connect before callback', function (done) {
    const pool = new Pool()
    let emittedClient = false
    pool.on('connect', function (client) {
      emittedClient = client
    })

    pool.connect(function (err, client, release) {
      if (err) return done(err)
      release()
      pool.end()
      assert.strictEqual(client, emittedClient)
      done()
    })
  })

  it('emits "connect" only with a successful connection', function () {
    const pool = new Pool({
      // This client will always fail to connect
      Client: mockClient({
        connect: function (cb) {
          process.nextTick(() => {
            cb(new Error('bad news'))
          })
        },
      }),
    })
    pool.on('connect', function () {
      throw new Error('should never get here')
    })
    return pool.connect().catch((e) => assert.strictEqual(e.message, 'bad news'))
  })

  it('emits acquire every time a client is acquired', function (done) {
    const pool = new Pool()
    let acquireCount = 0
    pool.on('acquire', function (client) {
      assert.ok(client)
      acquireCount++
    })
    for (let i = 0; i < 10; i++) {
      pool.connect(function (err, client, release) {
        if (err) return done(err)
        release()
      })
      pool.query('SELECT now()')
    }
    setTimeout(function () {
      assert.strictEqual(acquireCount, 20)
      pool.end(done)
    }, 100)
  })

  it('emits error and client if an idle client in the pool hits an error', function (done) {
    const pool = new Pool()
    pool.connect(function (err, client) {
      assert.strictEqual(err, undefined)
      client.release()
      setImmediate(function () {
        client.emit('error', new Error('problem'))
      })
      pool.once('error', function (err, errClient) {
        assert.strictEqual(err.message, 'problem')
        assert.strictEqual(errClient, client)
        done()
      })
    })
  })
})

function mockClient(methods) {
  return function () {
    const client = new EventEmitter()
    Object.assign(client, methods)
    return client
  }
}
