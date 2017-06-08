var expect = require('expect.js')
var describe = require('mocha').describe
var it = require('mocha').it
var Pool = require('../')

describe('Connection strings', function () {
  it('pool delegates connectionString property to client', function () {
    var pool = new Pool({
      connectionString: 'postgres://foo:bar@baz:1234/xur'
    })
    pool.connect(function (err, client) {
      expect(err).to.not.be(undefined)
      expect(client).to.not.be(undefined)
      expect(client.username).to.equal('foo')
      expect(client.password).to.equal('bar')
      expect(client.database).to.equal('baz')
      expect(client.port).to.equal(1234)
      expect(client.database).to.equal('xur')
    })
  })
})

