'use strict'

const WebSocketStream = require('websocket-stream');
var EventEmitter = require('events').EventEmitter

const { parse, serialize } = require('pg-protocol')

const flushBuffer = serialize.flush()
const syncBuffer = serialize.sync()
const endBuffer = serialize.end()

// TODO(bmc) support binary mode at some point
class Connection extends EventEmitter {
  constructor(config) {
    super()
    config = config || {}
    this.placeholderStream = false
    this.stream = config.stream // possibly null: if so, temporarily use placeholder and lazily make the stream on connect()
                                // since websocketstream attempts to connect on construction
    if(!this.stream) {
      var placeholder = {
        once: function(){},
        on: function(){},
        end: function() {},
        write: function(){},
        writable: false,
        socket: {
          close: function(){},
          _socket: {
            ref: function(){},
            unref: function(){}
          }
        } 
      }
      this.stream = placeholder
      this.placeholderStream = true
    } 
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

  connect(port, host) {
    if(this.placeholderStream) {
      if(port && host) {
        var url = 'ws://'+host+':'+port;
      } else {
        var url = 'ws://localhost:5432'
      }
      this.stream = new WebSocketStream(url)
      this.placeholderStream = false
    }
    var self = this

    this._connecting = true

    this.stream.once('connect', function () {
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
        default:
          // Any other response byte, including 'E' (ErrorResponse) indicating a server error
          self.stream.end()
          return self.emit('error', new Error('There was an error establishing an SSL connection'))
      }
      var tls = require('tls')
      var { isIP } = require('is-ip')
      const options = {
        socket: self.stream,
      }
      if (self.ssl !== true) {
        Object.assign(options, self.ssl)

        if ('key' in self.ssl) {
          options.key = self.ssl.key
        }
      }

      if (!isIP(host)) {
        options.servername = host
      }
      try {
        self.stream = tls.connect(options)
      } catch (err) {
        return self.emit('error', err)
      }
      self.attachListeners(self.stream)
      self.stream.on('error', reportStreamError)

      self.emit('sslconnect')
    })
  }

  attachListeners(stream) {
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

  requestSsl() {
    this.stream.write(serialize.requestSsl())
  }

  startup(config) {
    this.stream.write(serialize.startup(config))
  }

  cancel(processID, secretKey) {
    this._send(serialize.cancel(processID, secretKey))
  }

  password(password) {
    this._send(serialize.password(password))
  }

  sendSASLInitialResponseMessage(mechanism, initialResponse) {
    this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse))
  }

  sendSCRAMClientFinalMessage(additionalData) {
    this._send(serialize.sendSCRAMClientFinalMessage(additionalData))
  }

  _send(buffer) {
    if (!this.stream.writable) {
      return false
    }
    return this.stream.write(buffer)
  }

  query(text) {
    this._send(serialize.query(text))
  }

  // send parse message
  parse(query) {
    this._send(serialize.parse(query))
  }

  // send bind message
  bind(config) {
    this._send(serialize.bind(config))
  }

  // send execute message
  execute(config) {
    this._send(serialize.execute(config))
  }

  flush() {
    if (this.stream.writable) {
      this.stream.write(flushBuffer)
    }
  }

  sync() {
    this._ending = true
    this._send(flushBuffer)
    this._send(syncBuffer)
  }

  ref() {
    this.stream.socket._socket.ref()
  }

  unref() {
    this.stream.socket._socket.unref()
  }

  end() {
    // 0x58 = 'X'
    this._ending = true
    if (!this._connecting || !this.stream.writable) {
      if(this.stream.socket) {
        // if we don't pass in 'data' parameter to socket.close(), 
        // the server might send a 1005 close code in response (no status code present)
        // and ws will error upon receiving the 1005 code
        this.stream.socket.close(1000, 'connection.end called')
      } else {
        this.stream.end()
      }
      return
    }
    return this.stream.write(endBuffer, () => {
      // checking for stream.socket is purely for unit/integration test purposes 
      // websockets use stream.socket.close() while the streams used in testing use stream.end()
      if(this.stream.socket) {
        this.stream.socket.close(1000, 'connection.end called')
      } else {
        this.stream.end()
      }
    })
  }

  close(msg) {
    this._send(serialize.close(msg))
  }

  describe(msg) {
    this._send(serialize.describe(msg))
  }

  sendCopyFromChunk(chunk) {
    this._send(serialize.copyData(chunk))
  }

  endCopyFrom() {
    this._send(serialize.copyDone())
  }

  sendCopyFail(msg) {
    this._send(serialize.copyFail(msg))
  }
}

module.exports = Connection