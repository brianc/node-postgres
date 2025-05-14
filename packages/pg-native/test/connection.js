const Client = require('../')
const assert = require('assert')

describe('connection error', function () {
  it('doesnt segfault', function (done) {
    const client = new Client()
    client.connect('asldgsdgasgdasdg', function (err) {
      assert(err)
      // calling error on a closed client was segfaulting
      client.end()
      done()
    })
  })
})

describe('reading while not connected', function () {
  it('does not seg fault but does throw execption', function () {
    const client = new Client()
    assert.throws(function () {
      client.on('notification', function (msg) {})
    })
  })
})
