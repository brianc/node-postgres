'use strict'
const assert = require('assert')
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

assert.equalBuffers = function (actual, expected) {
  assert(Buffer.isBuffer(actual), 'actual must be a Buffer')
  assert(Buffer.isBuffer(expected), 'expected must be a Buffer')
  assert.equal(actual.compare(expected), 0)
}

const createClient = function (config) {
  const stream = new MemoryStream()
  const client = new Client(
    Object.assign(
      {
        connection: new Connection({ stream: stream }),
      },
      config
    )
  )
  client.connect()
  return client
}

module.exports = Object.assign({}, helper, {
  createClient: createClient,
  MemoryStream: MemoryStream,
})
