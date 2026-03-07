'use strict'

const expect = require('expect.js')
const EventEmitter = require('events').EventEmitter
const describe = require('mocha').describe
const it = require('mocha').it
const dc = require('diagnostics_channel')
const Pool = require('../')

const hasTracingChannel = typeof dc.tracingChannel === 'function'

function mockClient(methods) {
  return function () {
    const client = new EventEmitter()
    client.end = function (cb) {
      if (cb) process.nextTick(cb)
    }
    client._queryable = true
    client._ending = false
    client.processID = 12345
    Object.assign(client, methods)
    return client
  }
}

describe('diagnostics channels', function () {
  describe('pg:pool:connect', function () {
    ;(hasTracingChannel ? it : it.skip)('publishes start event when connect is called', function (done) {
      const pool = new Pool({
        Client: mockClient({
          connect: function (cb) {
            process.nextTick(() => cb(null))
          },
        }),
      })

      let capturedContext
      const channel = dc.tracingChannel('pg:pool:connect')
      const subs = {
        start: (ctx) => {
          capturedContext = ctx
        },
        end: () => {},
        asyncStart: () => {},
        asyncEnd: () => {},
        error: () => {},
      }

      channel.subscribe(subs)

      pool.connect(function (err, client, release) {
        if (err) return done(err)
        release()
        pool.end(() => {
          expect(capturedContext).to.be.ok()
          expect(capturedContext.pool).to.be.ok()
          expect(capturedContext.pool.maxSize).to.be(10)
          expect(capturedContext.pool.totalCount).to.be.a('number')

          channel.unsubscribe(subs)
          done()
        })
      })
    })
    ;(hasTracingChannel ? it : it.skip)('enriches context with client info on asyncEnd', function (done) {
      const pool = new Pool({
        Client: mockClient({
          connect: function (cb) {
            process.nextTick(() => cb(null))
          },
        }),
      })

      const channel = dc.tracingChannel('pg:pool:connect')
      const subs = {
        start: () => {},
        end: () => {},
        asyncStart: () => {},
        asyncEnd: (ctx) => {
          expect(ctx.client).to.be.ok()
          expect(ctx.client.processID).to.be(12345)

          channel.unsubscribe(subs)
          done()
        },
        error: () => {},
      }

      channel.subscribe(subs)

      pool.connect(function (err, client, release) {
        if (err) return done(err)
        release()
        pool.end()
      })
    })
  })

  describe('pg:pool:release', function () {
    it('publishes when a client is released', function (done) {
      const pool = new Pool({
        Client: mockClient({
          connect: function (cb) {
            process.nextTick(() => cb(null))
          },
        }),
      })

      let releaseMessage
      const channel = dc.channel('pg:pool:release')
      const onMessage = (msg) => {
        releaseMessage = msg
      }
      channel.subscribe(onMessage)

      pool.connect(function (err, client, release) {
        if (err) return done(err)
        release()
        pool.end(() => {
          expect(releaseMessage).to.be.ok()
          expect(releaseMessage.client).to.be.ok()
          expect(releaseMessage.client.processID).to.be(12345)

          channel.unsubscribe(onMessage)
          done()
        })
      })
    })

    it('includes error when released with error', function (done) {
      const pool = new Pool({
        Client: mockClient({
          connect: function (cb) {
            process.nextTick(() => cb(null))
          },
        }),
      })

      let releaseMessage
      const channel = dc.channel('pg:pool:release')
      const onMessage = (msg) => {
        releaseMessage = msg
      }
      channel.subscribe(onMessage)

      pool.connect(function (err, client, release) {
        if (err) return done(err)
        const releaseError = new Error('test error')
        release(releaseError)
        pool.end(() => {
          expect(releaseMessage).to.be.ok()
          expect(releaseMessage.error).to.be(releaseError)

          channel.unsubscribe(onMessage)
          done()
        })
      })
    })
  })

  describe('pg:pool:remove', function () {
    it('publishes when a client is removed', function (done) {
      const pool = new Pool({
        Client: mockClient({
          connect: function (cb) {
            process.nextTick(() => cb(null))
          },
        }),
      })

      let removeMessage
      const channel = dc.channel('pg:pool:remove')
      const onMessage = (msg) => {
        removeMessage = msg
      }
      channel.subscribe(onMessage)

      pool.connect(function (err, client, release) {
        if (err) return done(err)
        // release with error to trigger removal
        release(new Error('force remove'))
        pool.end(() => {
          expect(removeMessage).to.be.ok()
          expect(removeMessage.client).to.be.ok()
          expect(removeMessage.client.processID).to.be(12345)

          channel.unsubscribe(onMessage)
          done()
        })
      })
    })
  })
})
