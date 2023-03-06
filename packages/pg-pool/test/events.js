'use strict'

const expect = require('expect.js')
const EventEmitter = require('events').EventEmitter
const describe = require('mocha').describe
const it = require('mocha').it
const Pool = require('../')

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
      expect(client).to.be(emittedClient)
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
    return pool.connect().catch((e) => expect(e.message).to.equal('bad news'))
  })

  it('emits acquire every time a client is acquired', function (done) {
    const pool = new Pool()
    let acquireCount = 0
    pool.on('acquire', function (client) {
      expect(client).to.be.ok()
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
      expect(acquireCount).to.be(20)
      pool.end(done)
    }, 100)
  })

  it('emits release every time a client is released', function (done) {
    const pool = new Pool()
    let releaseCount = 0
    pool.on('release', function (err, client) {
      expect(err instanceof Error).not.to.be(true)
      expect(client).to.be.ok()
      releaseCount++
    })
    for (let i = 0; i < 10; i++) {
      pool.connect(function (err, client, release) {
        if (err) return done(err)
        release()
      })
      pool.query('SELECT now()')
    }
    setTimeout(function () {
      expect(releaseCount).to.be(20)
      pool.end(done)
    }, 100)
  })

  it('emits release with an error if client is released due to an error', function (done) {
    const pool = new Pool()
    pool.connect(function (err, client, release) {
      expect(err).to.equal(undefined)
      const releaseError = new Error('problem')
      pool.once('release', function (err, errClient) {
        console.log(err, errClient)
        expect(err).to.equal(releaseError)
        expect(errClient).to.equal(client)
        pool.end(done)
      })
      release(releaseError)
    })
  })

  it('emits error and client if an idle client in the pool hits an error', function (done) {
    const pool = new Pool()
    pool.connect(function (err, client) {
      expect(err).to.equal(undefined)
      client.release()
      setImmediate(function () {
        client.emit('error', new Error('problem'))
      })
      pool.once('error', function (err, errClient) {
        expect(err.message).to.equal('problem')
        expect(errClient).to.equal(client)
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
