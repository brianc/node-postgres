'use strict'
/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var net = require('net')
var EventEmitter = require('events').EventEmitter
var util = require('util')

// eslint-disable-next-line
const { parse, serialize } = require('../../pg-protocol/dist')

// TODO(bmc) support binary mode here
// var BINARY_MODE = 1
console.log('***using faster connection***')
var Connection = function (config) {
  EventEmitter.call(this)
  config = config || {}
  this.stream = config.stream || new net.Socket()
  this.stream.setNoDelay(true)
  this._keepAlive = config.keepAlive
  this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis
  this.lastBuffer = false
  this.parsedStatements = {}
  this.ssl = config.ssl || false
  this._ending = false
  this._emitMessage = false
  var self = this
  this.on('newListener', function (eventName) {
    if (eventName === 'message') {
      self._emitMessage = true
    }
  })
}

util.inherits(Connection, EventEmitter)

Connection.prototype.connect = function (port, host) {
  var self = this

  if (this.stream.readyState === 'closed') {
    this.stream.connect(port, host)
  } else if (this.stream.readyState === 'open') {
    this.emit('connect')
  }

  this.stream.on('connect', function () {
    if (self._keepAlive) {
      self.stream.setKeepAlive(true, self._keepAliveInitialDelayMillis)
    }
    self.emit('connect')
  })

  const reportStreamError = function (error) {
    // errors about disconnections should be ignored during disconnect
    if (self._ending && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
      return
    }
    self.emit('error', error)
  }
  this.stream.on('error', reportStreamError)

  this.stream.on('close', function () {
    self.emit('end')
  })

  if (!this.ssl) {
    return this.attachListeners(this.stream)
  }

  this.stream.once('data', function (buffer) {
    var responseCode = buffer.toString('utf8')
    switch (responseCode) {
      case 'S': // Server supports SSL connections, continue with a secure connection
        break
      case 'N': // Server does not support SSL connections
        self.stream.end()
        return self.emit('error', new Error('The server does not support SSL connections'))
      default: // Any other response byte, including 'E' (ErrorResponse) indicating a server error
        self.stream.end()
        return self.emit('error', new Error('There was an error establishing an SSL connection'))
    }
    var tls = require('tls')
    const options = Object.assign({
      socket: self.stream
    }, self.ssl)
    if (net.isIP(host) === 0) {
      options.servername = host
    }
    self.stream = tls.connect(options)
    self.attachListeners(self.stream)
    self.stream.on('error', reportStreamError)

    self.emit('sslconnect')
  })
}

Connection.prototype.attachListeners = function (stream) {
  stream.on('end', () => {
    this.emit('end')
  })
  parse(stream, (msg) => {
    var eventName = msg.name === 'error' ? 'errorMessage' : msg.name
    if (this._emitMessage) {
      this.emit('message', msg)
    }
    this.emit(eventName, msg)
  })
}

Connection.prototype.requestSsl = function () {
  this.stream.write(serialize.requestSsl())
}

Connection.prototype.startup = function (config) {
  this.stream.write(serialize.startup(config))
}

Connection.prototype.cancel = function (processID, secretKey) {
  this._send(serialize.cancel(processID, secretKey))
}

Connection.prototype.password = function (password) {
  this._send(serialize.password(password))
}

Connection.prototype.sendSASLInitialResponseMessage = function (mechanism, initialResponse) {
  this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse))
}

Connection.prototype.sendSCRAMClientFinalMessage = function (additionalData) {
  this._send(serialize.sendSCRAMClientFinalMessage(additionalData))
}

Connection.prototype._send = function (buffer) {
  if (!this.stream.writable) {
    return false
  }
  return this.stream.write(buffer)
}

Connection.prototype.query = function (text) {
  this._send(serialize.query(text))
}

// send parse message
Connection.prototype.parse = function (query) {
  this._send(serialize.parse(query))
}

// send bind message
// "more" === true to buffer the message until flush() is called
Connection.prototype.bind = function (config) {
  this._send(serialize.bind(config))
}

// send execute message
// "more" === true to buffer the message until flush() is called
Connection.prototype.execute = function (config) {
  this._send(serialize.execute(config))
}

const flushBuffer = serialize.flush()
Connection.prototype.flush = function () {
  if (this.stream.writable) {
    this.stream.write(flushBuffer)
  }
}

const syncBuffer = serialize.sync()
Connection.prototype.sync = function () {
  this._ending = true
  this._send(syncBuffer)
  this._send(flushBuffer)
}

const endBuffer = serialize.end()

Connection.prototype.end = function () {
  // 0x58 = 'X'
  this._ending = true
  if (!this.stream.writable) {
    this.stream.end()
    return
  }
  return this.stream.write(endBuffer, () => {
    this.stream.end()
  })
}

Connection.prototype.close = function (msg) {
  this._send(serialize.close(msg))
}

Connection.prototype.describe = function (msg) {
  this._send(serialize.describe(msg))
}

Connection.prototype.sendCopyFromChunk = function (chunk) {
  this._send(serialize.copyData(chunk))
}

Connection.prototype.endCopyFrom = function () {
  this._send(serialize.copyDone())
}

Connection.prototype.sendCopyFail = function (msg) {
  this._send(serialize.copyFail(msg))
}

module.exports = Connection
