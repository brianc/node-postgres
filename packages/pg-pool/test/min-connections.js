'use strict'
const EventEmitter = require('events').EventEmitter
const expect = require('expect.js')
const co = require('co')

const describe = require('mocha').describe
const it = require('mocha').it

const Pool = require('../')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Minimal mock client that connects immediately without a real database
class MockClient extends EventEmitter {
  constructor() {
    super()
    this._queryable = true
    this._ending = false
  }

  connect(cb) {
    process.nextTick(() => cb(null))
  }

  end(cb) {
    this._ending = true
    process.nextTick(() => {
      this.emit('end')
      if (cb) cb()
    })
  }

  query(text, values, cb) {
    if (typeof values === 'function') {
      cb = values
    }
    process.nextTick(() => cb && cb(null, { rows: [] }))
  }
}

describe('min connections maintenance', () => {
  describe('refills to min after maxUses retirement', () => {
    it(
      'creates replacement connections when clients are retired due to maxUses',
      co.wrap(function* () {
        const pool = new Pool({ min: 2, max: 5, maxUses: 2, Client: MockClient })

        // Acquire 2 clients and exhaust them (2 uses each with maxUses=2)
        const c1 = yield pool.connect()
        const c2 = yield pool.connect()
        c1.release()
        c2.release()

        yield wait(10)

        // Second acquisition returns the same clients
        const c1b = yield pool.connect()
        const c2b = yield pool.connect()
        // On release, both hit maxUses=2 and are retired
        c1b.release()
        c2b.release()

        // _ensureMinimum should schedule 2 replacement connections
        yield wait(50)

        expect(pool.totalCount).to.equal(2)
        expect(pool.idleCount).to.equal(2)

        return pool.end()
      })
    )

    it(
      'does not exceed min when multiple retirements happen simultaneously',
      co.wrap(function* () {
        const pool = new Pool({ min: 2, max: 10, maxUses: 2, Client: MockClient })

        // Exhaust 5 clients simultaneously
        const clients = []
        for (let i = 0; i < 5; i++) {
          clients.push(yield pool.connect())
        }
        for (const c of clients) c.release()

        yield wait(10)

        const clients2 = []
        for (let i = 0; i < 5; i++) {
          clients2.push(yield pool.connect())
        }
        for (const c of clients2) c.release()

        yield wait(50)

        // Should refill to exactly min, not more
        expect(pool.totalCount).to.equal(2)

        return pool.end()
      })
    )
  })

  describe('refills to min after idle client background errors', () => {
    it(
      'creates a replacement when an idle client emits an error',
      co.wrap(function* () {
        const pool = new Pool({ min: 2, max: 5, Client: MockClient })

        // Build up 2 idle connections
        const c1 = yield pool.connect()
        const c2 = yield pool.connect()
        c1.release()
        c2.release()

        yield wait(10)
        expect(pool.totalCount).to.equal(2)
        expect(pool.idleCount).to.equal(2)

        // Suppress pool-level error event to prevent unhandled rejection
        pool.on('error', () => {})

        // Background error on one idle client
        c1.emit('error', new Error('connection reset'))

        yield wait(50)

        // Pool should have refilled back to min=2
        expect(pool.totalCount).to.equal(2)

        return pool.end()
      })
    )
  })

  describe('serves pending requests after idle client error (makeIdleListener fix)', () => {
    it(
      'serves a queued connect after the only idle client errors',
      co.wrap(function* () {
        const pool = new Pool({ max: 1, Client: MockClient })

        // Place the single client into idle
        const c1 = yield pool.connect()
        c1.release()

        yield wait(10)
        expect(pool.idleCount).to.equal(1)

        pool.on('error', () => {})

        // Queue a pending connect while the client is idle
        const connectPromise = pool.connect()
        expect(pool.waitingCount).to.equal(1)

        // Error destroys the only idle client
        c1.emit('error', new Error('connection reset'))

        // The pending request must be served by a new connection
        const c2 = yield connectPromise
        expect(c2).not.to.equal(c1)
        c2.release()

        return pool.end()
      })
    )
  })
})
