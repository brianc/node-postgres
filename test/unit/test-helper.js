'use strict'
var EventEmitter = require('events').EventEmitter

var helper = require('../test-helper')
var Connection = require('../../lib/connection')

global.MemoryStream = function () {
  EventEmitter.call(this)
  this.packets = []
}

helper.sys.inherits(MemoryStream, EventEmitter)

var p = MemoryStream.prototype

p.write = function (packet) {
  this.packets.push(packet)
}

p.setKeepAlive = function () {}

p.writable = true

const createClient = function () {
  var stream = new MemoryStream()
  stream.readyState = 'open'
  var client = new Client({
    connection: new Connection({stream: stream})
  })
  client.connect()
  return client
}

module.exports = Object.assign({}, helper, {
  createClient: createClient
})
