'use strict'
const co = require('co')
const expect = require('expect.js')
const EventEmitter = require('events')

const describe = require('mocha').describe
const it = require('mocha').it

const Pool = require('../')

class MockClient extends EventEmitter {
  constructor() {
    super()
    this._queryable = true
    this._ending = false
  }

  connect(callback) {
    process.nextTick(callback)
  }

  query(_text, _values, callback) {
    process.nextTick(() => callback(undefined, { rows: [{ value: 1 }] }))
  }

  end(callback) {
    this._ending = true
    process.nextTick(() => {
      this.emit('end')
      callback?.()
    })
  }
}

class DeferredEndClient extends MockClient {
  end(callback) {
    this._ending = true
    this.endCallback = callback
  }

  finishEnd() {
    this.emit('end')
    this.endCallback?.()
  }
}

class DeferredQueryClient extends MockClient {
  query(_text, _values, callback) {
    this.queryCallbacks ??= []
    this.queryCallbacks.push(callback)
  }

  finishQuery(value) {
    this.queryCallbacks.shift()(undefined, { rows: [{ value }] })
  }
}

describe('pool ending', () => {
  it('ends without being used', (done) => {
    const pool = new Pool()
    pool.end(done)
  })

  it('ends with a promise', () => {
    return new Pool().end()
  })

  it(
    'ends with clients',
    co.wrap(function* () {
      const pool = new Pool()
      const res = yield pool.query('SELECT $1::text as name', ['brianc'])
      expect(res.rows[0].name).to.equal('brianc')
      return pool.end()
    })
  )

  it(
    'allows client to finish',
    co.wrap(function* () {
      const pool = new Pool()
      const query = pool.query('SELECT $1::text as name', ['brianc'])
      yield pool.end()
      const res = yield query
      expect(res.rows[0].name).to.equal('brianc')
    })
  )

  it('pool.end() - finish pending queries', async () => {
    const pool = new Pool({ max: 20 })
    let completed = 0
    for (let x = 1; x <= 20; x++) {
      pool.query('SELECT $1::text as name', ['brianc']).then(() => completed++)
    }
    await pool.end()
    expect(completed).to.equal(20)
  })

  it('can be used again after end completes', async () => {
    const pool = new Pool({ Client: MockClient })

    expect((await pool.query('SELECT 1')).rows[0].value).to.equal(1)
    await pool.end()
    expect(pool.totalCount).to.equal(0)

    expect((await pool.query('SELECT 1')).rows[0].value).to.equal(1)
    await pool.end()
  })

  it('cannot be used while end is still draining', async () => {
    const pool = new Pool({ Client: DeferredEndClient })
    const client = await pool.connect()
    client.release()

    let endCompleted = false
    const endPromise = pool.end().then(() => {
      endCompleted = true
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(endCompleted).to.equal(false)
    let error
    try {
      await pool.connect()
    } catch (caughtError) {
      error = caughtError
    }
    expect(error.message).to.contain('Cannot use a pool after calling end')

    client.finishEnd()
    await endPromise
    expect(endCompleted).to.equal(true)
    const reusedClient = await pool.connect()
    reusedClient.release()
    const secondEndPromise = pool.end()
    reusedClient.finishEnd()
    await secondEndPromise
  })

  it('finishes queued queries before end resolves', async () => {
    const pool = new Pool({ Client: DeferredQueryClient, max: 1 })
    const firstQuery = pool.query('SELECT 1')
    const secondQuery = pool.query('SELECT 2')
    const client = pool._clients[0]
    const endPromise = pool.end()

    await new Promise((resolve) => setImmediate(resolve))
    client.finishQuery(1)
    expect((await firstQuery).rows[0].value).to.equal(1)
    await new Promise((resolve) => setImmediate(resolve))
    client.finishQuery(2)
    expect((await secondQuery).rows[0].value).to.equal(2)
    await endPromise

    expect(pool.waitingCount).to.equal(0)
    expect(pool.totalCount).to.equal(0)
  })

  it('waits for every idle client and completes end once', async () => {
    const pool = new Pool({ Client: DeferredEndClient, max: 2 })
    const firstClient = await pool.connect()
    const secondClient = await pool.connect()
    firstClient.release()
    secondClient.release()

    let endCount = 0
    const endPromise = pool.end(() => {
      endCount++
    })
    firstClient.finishEnd()
    await new Promise((resolve) => setImmediate(resolve))
    expect(endCount).to.equal(0)
    secondClient.finishEnd()
    await new Promise((resolve) => setImmediate(resolve))
    expect(endCount).to.equal(1)
    expect(endPromise).to.equal(undefined)
  })
})
