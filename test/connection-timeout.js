'use strict'
const net = require('net')
const co = require('co')
const expect = require('expect.js')

const describe = require('mocha').describe
const it = require('mocha').it
const before = require('mocha').before
const after = require('mocha').after

const Pool = require('../')

describe('connection timeout', () => {
  before((done) => {
    this.server = net.createServer((socket) => {
    })

    this.server.listen(() => {
      this.port = this.server.address().port
      done()
    })
  })

  after((done) => {
    this.server.close(done)
  })

  it('should callback with an error if timeout is passed', (done) => {
    const pool = new Pool({ connectionTimeoutMillis: 10, port: this.port })
    pool.connect((err, client, release) => {
      expect(err).to.be.an(Error)
      expect(err.message).to.contain('timeout')
      expect(client).to.equal(undefined)
      expect(pool.idleCount).to.equal(0)
      done()
    })
  })

  it('should reject promise with an error if timeout is passed', (done) => {
    const pool = new Pool({ connectionTimeoutMillis: 10, port: this.port })
    pool.connect().catch(err => {
      expect(err).to.be.an(Error)
      expect(err.message).to.contain('timeout')
      expect(pool.idleCount).to.equal(0)
      done()
    })
  })

  it('should handle multiple timeouts', co.wrap(function * () {
    const errors = []
    const pool = new Pool({ connectionTimeoutMillis: 1, port: this.port })
    for (var i = 0; i < 15; i++) {
      try {
        yield pool.connect()
      } catch (e) {
        errors.push(e)
      }
    }
    expect(errors).to.have.length(15)
  }.bind(this)))
})

