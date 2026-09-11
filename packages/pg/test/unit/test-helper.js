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
  this._notifyPacketWaiters()
  if (cb) {
    cb()
  }
}

p._notifyPacketWaiters = function () {
  if (!this._packetWaiters) {
    return
  }
  for (const waiter of this._packetWaiters) {
    waiter()
  }
}

p.awaitPacketCount = function (count, timeout = 2000) {
  if (this.packets.length >= count) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      this._packetWaiters = this._packetWaiters.filter((waiter) => waiter !== check)
      reject(new Error(`timed out waiting for ${count} packet(s)`))
    }, timeout)
    const check = () => {
      if (this.packets.length >= count) {
        clearTimeout(timer)
        this._packetWaiters = this._packetWaiters.filter((waiter) => waiter !== check)
        resolve()
      }
    }
    if (!this._packetWaiters) {
      this._packetWaiters = []
    }
    this._packetWaiters.push(check)
  })
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
