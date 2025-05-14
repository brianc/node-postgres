'use strict'
const EventEmitter = require('events').EventEmitter

const helper = require('../test-helper')
const Connection = require('../../lib/connection')
const { Client } = helper

const MemoryStream = function () {
  EventEmitter.call(this)
  this.packets = []
}

helper.sys.inherits(MemoryStream, EventEmitter)

const p = MemoryStream.prototype

p.connect = function () {
  // NOOP
}

p.setNoDelay = () => {}

p.write = function (packet, cb) {
  this.packets.push(packet)
  if (cb) {
    cb()
  }
}

p.end = function () {
  p.closed = true
}

p.setKeepAlive = function () {}
p.closed = false
p.writable = true

const createClient = function () {
  const stream = new MemoryStream()
  const client = new Client({
    connection: new Connection({ stream: stream }),
  })
  client.connect()
  return client
}

module.exports = Object.assign({}, helper, {
  createClient: createClient,
  MemoryStream: MemoryStream,
})
