var expect = require('expect.js')
var EventEmitter = require('events').EventEmitter
var describe = require('mocha').describe
var it = require('mocha').it
var objectAssign = require('object-assign')
var Pool = require('../')

describe('events', function () {
  it('emits connect before callback', function (done) {
    var pool = new Pool()
    var emittedClient = false
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

  it('emits "error" with a failed connection', function (done) {
    var pool = new Pool({
      // This client will always fail to connect
      Client: mockClient({
        connect: function (cb) {
          process.nextTick(function () { cb(new Error('bad news')) })
        }
      })
    })
    pool.on('connect', function () {
      throw new Error('should never get here')
    })
    pool.on('error', function (err) {
      if (err) done()
      else done(new Error('expected failure'))
    })
    pool.connect()
  })

  it('callback err with a failed connection', function (done) {
    var pool = new Pool({
      // This client will always fail to connect
      Client: mockClient({
        connect: function (cb) {
          process.nextTick(function () { cb(new Error('bad news')) })
        }
      })
    })
    pool.on('connect', function () {
      throw new Error('should never get here')
    })
    pool.on('error', function (err) {
      if (!err) done(new Error('expected failure'))
    })
    pool.connect(function (err) {
      if (err) done()
      else done(new Error('expected failure'))
    })
  })

  it('emits acquire every time a client is acquired', function (done) {
    var pool = new Pool()
    var acquireCount = 0
    pool.on('acquire', function (client) {
      expect(client).to.be.ok()
      acquireCount++
    })
    for (var i = 0; i < 10; i++) {
      pool.connect(function (err, client, release) {
        err ? done(err) : release()
        release()
        if (err) return done(err)
      })
      pool.query('SELECT now()')
    }
    setTimeout(function () {
      expect(acquireCount).to.be(20)
      pool.end(done)
    }, 40)
  })
})

function mockClient (methods) {
  return function () {
    var client = new EventEmitter()
    objectAssign(client, methods)
    return client
  }
}
