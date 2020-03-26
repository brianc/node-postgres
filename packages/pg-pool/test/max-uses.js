const expect = require('expect.js')
const co = require('co')
const _ = require('lodash')

const describe = require('mocha').describe
const it = require('mocha').it

const Pool = require('../')

describe('maxUses of 2', () => {
  it('can create a single client and use it once', co.wrap(function * () {
    const pool = new Pool({ maxUses: 2 })
    expect(pool.waitingCount).to.equal(0)
    const client = yield pool.connect()
    const res = yield client.query('SELECT $1::text as name', ['hi'])
    expect(res.rows[0].name).to.equal('hi')
    client.release()
    pool.end()
  }))

  it('getting a connection a second time returns the same connection and releasing it also closes it', co.wrap(function * () {
    const pool = new Pool({ maxUses: 2 })
    expect(pool.waitingCount).to.equal(0)
    const client = yield pool.connect()
    client.release()
    const client2 = yield pool.connect()
    expect(client).to.equal(client2)
    expect(client2._ending).to.equal(false)
    client2.release()
    expect(client2._ending).to.equal(true)
    return yield pool.end()
  }))

  it('getting a connection a third time returns a new connection', co.wrap(function * () {
    const pool = new Pool({ maxUses: 2 })
    expect(pool.waitingCount).to.equal(0)
    const client = yield pool.connect()
    client.release()
    const client2 = yield pool.connect()
    expect(client).to.equal(client2)
    client2.release()
    const client3 = yield pool.connect()
    expect(client3).not.to.equal(client2)
    client3.release()
    return yield pool.end()
  }))

  it('logs when removing an expended client', co.wrap(function * () {
    const messages = []
    const log = function (msg) {
      messages.push(msg)
    }
    const pool = new Pool({ maxUses: 1, log })
    const client = yield pool.connect()
    client.release()
    expect(messages).to.contain('removing expended client')
    return yield pool.end()
  }))
})
