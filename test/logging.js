var expect = require('expect.js')

var describe = require('mocha').describe
var it = require('mocha').it

var Pool = require('../')

describe('logging', function () {
  it('logs to supplied log function if given', function () {
    var messages = []
    var log = function (msg) {
      messages.push(msg)
    }
    var pool = new Pool({ log: log })
    return pool.query('SELECT NOW()').then(function () {
      expect(messages.length).to.be.greaterThan(0)
      return pool.end()
    })
  })
})
