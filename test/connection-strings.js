var expect = require('expect.js')
var describe = require('mocha').describe
var it = require('mocha').it
var Pool = require('../')

describe('Connection strings', function () {
  it('pool delegates connectionString property to client', function (done) {
    var connectionString = 'postgres://foo:bar@baz:1234/xur'

    var pool = new Pool({
      // use a fake client so we can check we're passed the connectionString
      Client: function (args) {
        expect(args.connectionString).to.equal(connectionString)
        return {
          connect: function (cb) {
            cb(new Error('testing'))
          },
          on: function () { }
        }
      },
      connectionString: connectionString
    })

    pool.connect(function (err, client) {
      expect(err).to.not.be(undefined)
      done()
    })
  })
})

