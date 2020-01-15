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

var Writer = require('buffer-writer')
// eslint-disable-next-line
var PacketStream = require('pg-packet-stream')

var warnDeprecation = require('./compat/warn-deprecation')

var TEXT_MODE = 0

// TODO(bmc) support binary mode here
// var BINARY_MODE = 1
console.log('using faster connection')
var Connection = function (config) {
  EventEmitter.call(this)
  config = config || {}
  this.stream = config.stream || new net.Socket()
  this.stream.setNoDelay(true)
  this._keepAlive = config.keepAlive
  this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis
  this.lastBuffer = false
  this.lastOffset = 0
  this.buffer = null
  this.offset = null
  this.encoding = config.encoding || 'utf8'
  this.parsedStatements = {}
  this.writer = new Writer()
  this.ssl = config.ssl || false
  this._ending = false
  this._mode = TEXT_MODE
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
      case 'N': // Server does not support SSL connections
        return self.emit('error', new Error('The server does not support SSL connections'))
      case 'S': // Server supports SSL connections, continue with a secure connection
        break
      default:
        // Any other response byte, including 'E' (ErrorResponse) indicating a server error
        return self.emit('error', new Error('There was an error establishing an SSL connection'))
    }
    var tls = require('tls')
    const options = {
      socket: self.stream,
      checkServerIdentity: self.ssl.checkServerIdentity || tls.checkServerIdentity,
      rejectUnauthorized: self.ssl.rejectUnauthorized,
      ca: self.ssl.ca,
      pfx: self.ssl.pfx,
      key: self.ssl.key,
      passphrase: self.ssl.passphrase,
      cert: self.ssl.cert,
      secureOptions: self.ssl.secureOptions,
      NPNProtocols: self.ssl.NPNProtocols
    }
    if (typeof self.ssl.rejectUnauthorized !== 'boolean') {
      warnDeprecation('Implicit disabling of certificate verification is deprecated and will be removed in pg 8. Specify `rejectUnauthorized: true` to require a valid CA or `rejectUnauthorized: false` to explicitly opt out of MITM protection.', 'PG-SSL-VERIFY')
    }
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
  var self = this
  const mode = this._mode === TEXT_MODE ? 'text' : 'binary'
  const packetStream = new PacketStream.PgPacketStream({ mode })
  this.stream.pipe(packetStream)
  packetStream.on('data', (msg) => {
    var eventName = msg.name === 'error' ? 'errorMessage' : msg.name
    if (self._emitMessage) {
      self.emit('message', msg)
    }
    self.emit(eventName, msg)
  })
  stream.on('end', function () {
    self.emit('end')
  })
}

Connection.prototype.requestSsl = function () {
  var bodyBuffer = this.writer
    .addInt16(0x04d2)
    .addInt16(0x162f)
    .flush()

  var length = bodyBuffer.length + 4

  var buffer = new Writer()
    .addInt32(length)
    .add(bodyBuffer)
    .join()
  this.stream.write(buffer)
}

Connection.prototype.startup = function (config) {
  var writer = this.writer.addInt16(3).addInt16(0)

  Object.keys(config).forEach(function (key) {
    var val = config[key]
    writer.addCString(key).addCString(val)
  })

  writer.addCString('client_encoding').addCString("'utf-8'")

  var bodyBuffer = writer.addCString('').flush()
  // this message is sent without a code

  var length = bodyBuffer.length + 4

  var buffer = new Writer()
    .addInt32(length)
    .add(bodyBuffer)
    .join()
  this.stream.write(buffer)
}

Connection.prototype.cancel = function (processID, secretKey) {
  var bodyBuffer = this.writer
    .addInt16(1234)
    .addInt16(5678)
    .addInt32(processID)
    .addInt32(secretKey)
    .flush()

  var length = bodyBuffer.length + 4

  var buffer = new Writer()
    .addInt32(length)
    .add(bodyBuffer)
    .join()
  this.stream.write(buffer)
}

Connection.prototype.password = function (password) {
  // 0x70 = 'p'
  this._send(0x70, this.writer.addCString(password))
}

Connection.prototype.sendSASLInitialResponseMessage = function (mechanism, initialResponse) {
  // 0x70 = 'p'
  this.writer
    .addCString(mechanism)
    .addInt32(Buffer.byteLength(initialResponse))
    .addString(initialResponse)

  this._send(0x70)
}

Connection.prototype.sendSCRAMClientFinalMessage = function (additionalData) {
  // 0x70 = 'p'
  this.writer.addString(additionalData)

  this._send(0x70)
}

Connection.prototype._send = function (code, more) {
  if (!this.stream.writable) {
    return false
  }
  return this.stream.write(this.writer.flush(code))
}

Connection.prototype.query = function (text) {
  // 0x51 = Q
  this.stream.write(this.writer.addCString(text).flush(0x51))
}

// send parse message
Connection.prototype.parse = function (query) {
  // expect something like this:
  // { name: 'queryName',
  //   text: 'select * from blah',
  //   types: ['int8', 'bool'] }

  // normalize missing query names to allow for null
  query.name = query.name || ''
  if (query.name.length > 63) {
    /* eslint-disable no-console */
    console.error('Warning! Postgres only supports 63 characters for query names.')
    console.error('You supplied %s (%s)', query.name, query.name.length)
    console.error('This can cause conflicts and silent errors executing queries')
    /* eslint-enable no-console */
  }
  // normalize null type array
  query.types = query.types || []
  var len = query.types.length
  var buffer = this.writer
    .addCString(query.name) // name of query
    .addCString(query.text) // actual query text
    .addInt16(len)
  for (var i = 0; i < len; i++) {
    buffer.addInt32(query.types[i])
  }

  var code = 0x50
  this._send(code)
  this.flush()
}

// send bind message
// "more" === true to buffer the message until flush() is called
Connection.prototype.bind = function (config) {
  // normalize config
  config = config || {}
  config.portal = config.portal || ''
  config.statement = config.statement || ''
  config.binary = config.binary || false
  var values = config.values || []
  var len = values.length
  var useBinary = false
  for (var j = 0; j < len; j++) {
    useBinary |= values[j] instanceof Buffer
  }
  var buffer = this.writer.addCString(config.portal).addCString(config.statement)
  if (!useBinary) {
    buffer.addInt16(0)
  } else {
    buffer.addInt16(len)
    for (j = 0; j < len; j++) {
      buffer.addInt16(values[j] instanceof Buffer)
    }
  }
  buffer.addInt16(len)
  for (var i = 0; i < len; i++) {
    var val = values[i]
    if (val === null || typeof val === 'undefined') {
      buffer.addInt32(-1)
    } else if (val instanceof Buffer) {
      buffer.addInt32(val.length)
      buffer.add(val)
    } else {
      buffer.addInt32(Buffer.byteLength(val))
      buffer.addString(val)
    }
  }

  if (config.binary) {
    buffer.addInt16(1) // format codes to use binary
    buffer.addInt16(1)
  } else {
    buffer.addInt16(0) // format codes to use text
  }
  // 0x42 = 'B'
  this._send(0x42)
  this.flush()
}

// send execute message
// "more" === true to buffer the message until flush() is called
Connection.prototype.execute = function (config) {
  config = config || {}
  config.portal = config.portal || ''
  config.rows = config.rows || ''
  this.writer.addCString(config.portal).addInt32(config.rows)

  // 0x45 = 'E'
  this._send(0x45)
  this.flush()
}

var emptyBuffer = Buffer.alloc(0)

const flushBuffer = Buffer.from([0x48, 0x00, 0x00, 0x00, 0x04])
Connection.prototype.flush = function () {
  if (this.stream.writable) {
    this.stream.write(flushBuffer)
  }
}

const syncBuffer = Buffer.from([0x53, 0x00, 0x00, 0x00, 0x04])
Connection.prototype.sync = function () {
  this._ending = true
  // clear out any pending data in the writer
  this.writer.clear()
  if (this.stream.writable) {
    this.stream.write(syncBuffer)
    this.stream.write(flushBuffer)
  }
}

const END_BUFFER = Buffer.from([0x58, 0x00, 0x00, 0x00, 0x04])

Connection.prototype.end = function () {
  // 0x58 = 'X'
  this.writer.clear()
  this._ending = true
  return this.stream.write(END_BUFFER, () => {
    this.stream.end()
  })
}

Connection.prototype.close = function (msg) {
  this.writer.addCString(msg.type + (msg.name || ''))
  this._send(0x43)
}

Connection.prototype.describe = function (msg) {
  this.writer.addCString(msg.type + (msg.name || ''))
  this._send(0x44)
  this.flush()
}

Connection.prototype.sendCopyFromChunk = function (chunk) {
  this.stream.write(this.writer.add(chunk).flush(0x64))
}

Connection.prototype.endCopyFrom = function () {
  this.stream.write(this.writer.add(emptyBuffer).flush(0x63))
}

Connection.prototype.sendCopyFail = function (msg) {
  // this.stream.write(this.writer.add(emptyBuffer).flush(0x66));
  this.writer.addCString(msg)
  this._send(0x66)
}

module.exports = Connection
