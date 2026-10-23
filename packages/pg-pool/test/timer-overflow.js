'use strict'
const EventEmitter = require('events').EventEmitter
const expect = require('expect.js')

const describe = require('mocha').describe
const it = require('mocha').it

const Pool = require('../')

// setTimeout() treats a delay above 2^31-1 ms as 1 ms. These tests use a mock client so they do not need a database.
// Each one would fail within a few milliseconds if the pool passed an out-of-range delay to setTimeout.
const wait = (time) => new Promise((resolve) => setTimeout(resolve, time))

class MockClient extends EventEmitter {
  constructor(options) {
    super()
    this.connectDelay = options.connectDelay || 0
    this._queryable = true
    this._ending = false
  }

  connect(cb) {
    setTimeout(() => cb(null), this.connectDelay)
  }

  isConnected() {
    return false
  }

  end(cb) {
    this._ending = true
    this.emit('end')
    if (cb) process.nextTick(cb)
  }

  unref() {}
}

const newPool = (options) => new Pool({ Client: MockClient, ...options })

describe('timers with values above 2^31-1 ms', () => {
  it('maxLifetimeSeconds does not expire a client straight away', async () => {
    // 2592000 s is 30 days, which is 2592000000 ms
    const pool = newPool({ maxLifetimeSeconds: 2592000 })
    const client = await pool.connect()
    client.release()
    await wait(50)
    expect(pool.totalCount).to.equal(1)
    expect(pool.expiredCount).to.equal(0)
    await pool.end()
  })

  it('idleTimeoutMillis does not remove an idle client straight away', async () => {
    const pool = newPool({ idleTimeoutMillis: 3000000000 })
    const client = await pool.connect()
    client.release()
    await wait(50)
    expect(pool.idleCount).to.equal(1)
    expect(pool.totalCount).to.equal(1)
    await pool.end()
  })

  it('idleTimeoutMillis of Infinity does not remove an idle client straight away', async () => {
    const pool = newPool({ idleTimeoutMillis: Infinity })
    const client = await pool.connect()
    client.release()
    await wait(50)
    expect(pool.idleCount).to.equal(1)
    expect(pool.totalCount).to.equal(1)
    await pool.end()
  })

  it('connectionTimeoutMillis does not time out a slow connect straight away', async () => {
    const pool = newPool({ connectionTimeoutMillis: Math.pow(2, 31), connectDelay: 50 })
    const client = await pool.connect()
    client.release()
    expect(pool.totalCount).to.equal(1)
    await pool.end()
  })

  it('connectionTimeoutMillis does not time out a queued request straight away', async () => {
    const pool = newPool({ connectionTimeoutMillis: Math.pow(2, 31), max: 1 })
    const first = await pool.connect()
    const queued = pool.connect()
    await wait(50)
    first.release()
    const second = await queued
    second.release()
    await pool.end()
  })
})
