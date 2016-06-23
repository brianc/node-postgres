var expect = require('expect.js')

var describe = require('mocha').describe
var it = require('mocha').it

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
})
