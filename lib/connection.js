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
var Reader = require('packet-reader')

var TEXT_MODE = 0
var BINARY_MODE = 1
var FORMAT_TEXT = 'text'
var FORMAT_BINARY = 'binary'
var ROW_DESCRIPTION = 'rowDescription'
var DATA_ROW = 'dataRow'

var emptyBuffer = Buffer.alloc(0)
const END_BUFFER = Buffer.from([0x58, 0x00, 0x00, 0x00, 0x04])

class Message {
  constructor (name, length) {
    this.name = name
    this.length = length
  }
}

class Field {
  constructor () {
    this.name = null
    this.tableID = null
    this.columnID = null
    this.dataTypeID = null
    this.dataTypeSize = null
    this.dataTypeModifier = null
    this.format = null
  }
}

class DataRowMessage {
  constructor (length, fieldCount) {
    this.name = DATA_ROW
    this.length = length
    this.fieldCount = fieldCount
    this.fields = []
  }
}

class Connection extends EventEmitter {
  constructor (config) {
    super()
    config = config || {}
    this.stream = config.stream || new net.Stream()
    this._keepAlive = config.keepAlive
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
    this._reader = new Reader({
      headerSize: 1,
      lengthPadding: -4
    })
    this.on('newListener', (eventName) => {
      if (eventName === 'message') {
        this._emitMessage = true
      }
    })
  }

  connect (port, host) {
    if (this.stream.readyState === 'closed') {
      this.stream.connect(port, host)
    } else if (this.stream.readyState === 'open') {
      this.emit('connect')
    }

    this.stream.on('connect', () => {
      if (this._keepAlive) {
        this.stream.setKeepAlive(true)
      }
      this.emit('connect')
    })

    this.stream.on('error', (error) => {
      // don't raise ECONNRESET errors - they can & should be ignored
      // during disconnect
      if (this._ending && error.code === 'ECONNRESET') {
        return
      }
      this.emit('error', error)
    })

    this.stream.on('close', () => {
      this.emit('end')
    })

    if (!this.ssl) {
      return this.attachListeners(this.stream)
    }

    this.stream.once('data', (buffer) => {
      var responseCode = buffer.toString('utf8')
      if (responseCode !== 'S') {
        return this.emit('error', new Error('The server does not support SSL connections'))
      }
      var tls = require('tls')
      this.stream = tls.connect({
        socket: this.stream,
        servername: host,
        rejectUnauthorized: this.ssl.rejectUnauthorized,
        ca: this.ssl.ca,
        pfx: this.ssl.pfx,
        key: this.ssl.key,
        passphrase: this.ssl.passphrase,
        cert: this.ssl.cert,
        NPNProtocols: this.ssl.NPNProtocols
      })
      this.attachListeners(this.stream)
      this.emit('sslconnect')

      this.stream.on('error', (error) => {
        this.emit('error', error)
      })
    })
  }

  attachListeners (stream) {
    stream.on('data', (buff) => {
      this._reader.addChunk(buff)
      var packet = this._reader.read()
      while (packet) {
        var msg = this.parseMessage(packet)
        if (this._emitMessage) {
          this.emit('message', msg)
        }
        this.emit(msg.name, msg)
        packet = this._reader.read()
      }
    })
    stream.on('end', () => {
      this.emit('end')
    })
  }

  requestSsl () {
    var bodyBuffer = this.writer
      .addInt16(0x04D2)
      .addInt16(0x162F).flush()

    var length = bodyBuffer.length + 4

    var buffer = new Writer()
      .addInt32(length)
      .add(bodyBuffer)
      .join()
    this.stream.write(buffer)
  }

  startup (config) {
    var writer = this.writer
      .addInt16(3)
      .addInt16(0)

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

  cancel (processID, secretKey) {
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

  password (password) {
    // 0x70 = 'p'
    this._send(0x70, this.writer.addCString(password))
  }

  _send (code, more) {
    if (!this.stream.writable) {
      return false
    }
    if (more === true) {
      this.writer.addHeader(code)
    } else {
      return this.stream.write(this.writer.flush(code))
    }
  }

  query (text) {
    // 0x51 = Q
    this.stream.write(this.writer.addCString(text).flush(0x51))
  }

  // send parse message
  // "more" === true to buffer the message until flush() is called
  parse (query, more) {
    // expect something like this:
    // { name: 'queryName',
    //   text: 'select * from blah',
    //   types: ['int8', 'bool'] }

    // normalize missing query names to allow for null
    query.name = query.name || ''
    if (query.name.length > 63) {
      console.error('Warning! Postgres only supports 63 characters for query names.')
      console.error('You supplied', query.name, '(', query.name.length, ')')
      console.error('This can cause conflicts and silent errors executing queries')
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
    this._send(code, more)
  }

  // send bind message
  // "more" === true to buffer the message until flush() is called
  bind (config, more) {
    // normalize config
    config = config || {}
    config.portal = config.portal || ''
    config.statement = config.statement || ''
    config.binary = config.binary || false
    var values = config.values || []
    var len = values.length
    var useBinary = false

    for (var j = 0; j < len; j++) { useBinary |= values[j] instanceof Buffer }

    var buffer = this.writer
      .addCString(config.portal)
      .addCString(config.statement)

    if (!useBinary) { buffer.addInt16(0) } else {
      buffer.addInt16(len)
      for (j = 0; j < len; j++) { buffer.addInt16(values[j] instanceof Buffer) }
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
    this._send(0x42, more)
  }

  // send execute message
  // "more" === true to buffer the message until flush() is called
  execute (config, more) {
    config = config || {}
    config.portal = config.portal || ''
    config.rows = config.rows || ''
    this.writer
      .addCString(config.portal)
      .addInt32(config.rows)

    // 0x45 = 'E'
    this._send(0x45, more)
  }

  flush () {
    // 0x48 = 'H'
    this.writer.add(emptyBuffer)
    this._send(0x48)
  }

  sync () {
    // clear out any pending data in the writer
    this.writer.flush(0)

    this.writer.add(emptyBuffer)
    this._ending = true
    this._send(0x53)
  }

  end () {
    // 0x58 = 'X'
    this.writer.add(emptyBuffer)
    this._ending = true
    return this.stream.write(END_BUFFER)
  }

  close (msg, more) {
    this.writer.addCString(msg.type + (msg.name || ''))
    this._send(0x43, more)
  }

  describe (msg, more) {
    this.writer.addCString(msg.type + (msg.name || ''))
    this._send(0x44, more)
  }

  sendCopyFromChunk (chunk) {
    this.stream.write(this.writer.add(chunk).flush(0x64))
  }

  endCopyFrom () {
    this.stream.write(this.writer.add(emptyBuffer).flush(0x63))
  }

  sendCopyFail (msg) {
    // this.stream.write(this.writer.add(emptyBuffer).flush(0x66));
    this.writer.addCString(msg)
    this._send(0x66)
  }

  parseMessage (buffer) {
    this.offset = 0
    var length = buffer.length + 4
    switch (this._reader.header) {
      case 0x52: // R
        return this.parseR(buffer, length)

      case 0x53: // S
        return this.parseS(buffer, length)

      case 0x4b: // K
        return this.parseK(buffer, length)

      case 0x43: // C
        return this.parseC(buffer, length)

      case 0x5a: // Z
        return this.parseZ(buffer, length)

      case 0x54: // T
        return this.parseT(buffer, length)

      case 0x44: // D
        return this.parseD(buffer, length)

      case 0x45: // E
        return this.parseE(buffer, length)

      case 0x4e: // N
        return this.parseN(buffer, length)

      case 0x31: // 1
        return new Message('parseComplete', length)

      case 0x32: // 2
        return new Message('bindComplete', length)

      case 0x33: // 3
        return new Message('closeComplete', length)

      case 0x41: // A
        return this.parseA(buffer, length)

      case 0x6e: // n
        return new Message('noData', length)

      case 0x49: // I
        return new Message('emptyQuery', length)

      case 0x73: // s
        return new Message('portalSuspended', length)

      case 0x47: // G
        return this.parseG(buffer, length)

      case 0x48: // H
        return this.parseH(buffer, length)

      case 0x57: // W
        return new Message('replicationStart', length)

      case 0x63: // c
        return new Message('copyDone', length)

      case 0x64: // d
        return this.parsed(buffer, length)
    }
  }

  parseR (buffer, length) {
    var code = 0
    var msg = new Message('authenticationOk', length)

    if (msg.length === 8) {
      code = this.parseInt32(buffer)
      if (code === 3) {
        msg.name = 'authenticationCleartextPassword'
      }
      return msg
    }

    if (msg.length === 12) {
      code = this.parseInt32(buffer)
      if (code === 5) { // md5 required
        msg.name = 'authenticationMD5Password'
        msg.salt = Buffer.alloc(4)
        buffer.copy(msg.salt, 0, this.offset, this.offset + 4)
        this.offset += 4
        return msg
      }
    }

    throw new Error('Unknown authenticationOk message type' + util.inspect(msg))
  }

  parseS (buffer, length) {
    var msg = new Message('parameterStatus', length)
    msg.parameterName = this.parseCString(buffer)
    msg.parameterValue = this.parseCString(buffer)
    return msg
  }

  parseK (buffer, length) {
    var msg = new Message('backendKeyData', length)
    msg.processID = this.parseInt32(buffer)
    msg.secretKey = this.parseInt32(buffer)
    return msg
  }

  parseC (buffer, length) {
    var msg = new Message('commandComplete', length)
    msg.text = this.parseCString(buffer)
    return msg
  }

  parseZ (buffer, length) {
    var msg = new Message('readyForQuery', length)
    msg.name = 'readyForQuery'
    msg.status = this.readString(buffer, 1)
    return msg
  }

  parseT (buffer, length) {
    var msg = new Message(ROW_DESCRIPTION, length)
    msg.fieldCount = this.parseInt16(buffer)
    var fields = []
    for (var i = 0; i < msg.fieldCount; i++) {
      fields.push(this.parseField(buffer))
    }
    msg.fields = fields
    return msg
  }

  parseField (buffer) {
    var field = new Field()
    field.name = this.parseCString(buffer)
    field.tableID = this.parseInt32(buffer)
    field.columnID = this.parseInt16(buffer)
    field.dataTypeID = this.parseInt32(buffer)
    field.dataTypeSize = this.parseInt16(buffer)
    field.dataTypeModifier = this.parseInt32(buffer)
    if (this.parseInt16(buffer) === TEXT_MODE) {
      this._mode = TEXT_MODE
      field.format = FORMAT_TEXT
    } else {
      this._mode = BINARY_MODE
      field.format = FORMAT_BINARY
    }
    return field
  }

  // extremely hot-path code
  parseD (buffer, length) {
    var fieldCount = this.parseInt16(buffer)
    var msg = new DataRowMessage(length, fieldCount)
    for (var i = 0; i < fieldCount; i++) {
      msg.fields.push(this._readValue(buffer))
    }
    return msg
  }

  // extremely hot-path code
  _readValue (buffer) {
    var length = this.parseInt32(buffer)
    if (length === -1) return null
    if (this._mode === TEXT_MODE) {
      return this.readString(buffer, length)
    }
    return this.readBytes(buffer, length)
  }

  // parses error
  parseE (buffer, length) {
    var fields = {}
    var msg, item
    var input = new Message('error', length)
    var fieldType = this.readString(buffer, 1)
    while (fieldType !== '\0') {
      fields[fieldType] = this.parseCString(buffer)
      fieldType = this.readString(buffer, 1)
    }
    if (input.name === 'error') {
      // the msg is an Error instance
      msg = new Error(fields.M)
      for (item in input) {
        // copy input properties to the error
        if (input.hasOwnProperty(item)) {
          msg[item] = input[item]
        }
      }
    } else {
      // the msg is an object literal
      msg = input
      msg.message = fields.M
    }
    msg.severity = fields.S
    msg.code = fields.C
    msg.detail = fields.D
    msg.hint = fields.H
    msg.position = fields.P
    msg.internalPosition = fields.p
    msg.internalQuery = fields.q
    msg.where = fields.W
    msg.schema = fields.s
    msg.table = fields.t
    msg.column = fields.c
    msg.dataType = fields.d
    msg.constraint = fields.n
    msg.file = fields.F
    msg.line = fields.L
    msg.routine = fields.R
    return msg
  }

  // same thing, different name
  parseN (buffer, length) {
    var msg = this.parseE(buffer, length)
    msg.name = 'notice'
    return msg
  }

  parseA (buffer, length) {
    var msg = new Message('notification', length)
    msg.processId = this.parseInt32(buffer)
    msg.channel = this.parseCString(buffer)
    msg.payload = this.parseCString(buffer)
    return msg
  }

  parseG (buffer, length) {
    var msg = new Message('copyInResponse', length)
    return this.parseGH(buffer, msg)
  }

  parseH (buffer, length) {
    var msg = new Message('copyOutResponse', length)
    return this.parseGH(buffer, msg)
  }

  parseGH (buffer, msg) {
    var isBinary = buffer[this.offset] !== 0
    this.offset++
    msg.binary = isBinary
    var columnCount = this.parseInt16(buffer)
    msg.columnTypes = []
    for (var i = 0; i < columnCount; i++) {
      msg.columnTypes.push(this.parseInt16(buffer))
    }
    return msg
  }

  parsed (buffer, length) {
    var msg = new Message('copyData', length)
    msg.chunk = this.readBytes(buffer, msg.length - 4)
    return msg
  }

  parseInt32 (buffer) {
    var value = buffer.readInt32BE(this.offset, true)
    this.offset += 4
    return value
  }

  parseInt16 (buffer) {
    var value = buffer.readInt16BE(this.offset, true)
    this.offset += 2
    return value
  }

  readString (buffer, length) {
    return buffer.toString(this.encoding, this.offset, (this.offset += length))
  }

  readBytes (buffer, length) {
    return buffer.slice(this.offset, (this.offset += length))
  }

  parseCString (buffer) {
    var start = this.offset
    var end = buffer.indexOf(0, start)
    this.offset = end + 1
    return buffer.toString(this.encoding, start, end)
  }
}

// end parsing methods
module.exports = Connection
