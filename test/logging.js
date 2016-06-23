var expect = require('expect.js')
var co = require('co')

var describe = require('mocha').describe
var it = require('mocha').it

var Pool = require('../')

describe('logging', function () {
  it('logs to supplied log function if given', co.wrap(function * () {
    var messages = []
    var log = function (msg) {
      messages.push(msg)
    }
    var pool = new Pool({ log: log })
    yield pool.query('SELECT NOW()')
    expect(messages.length).to.be.greaterThan(0)
    return pool.end()
  }))
})
