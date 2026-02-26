'use strict'

const EventEmitter = require('events').EventEmitter

const { parse, serialize } = require('pg-protocol')
const { getStream } = require('./stream')
const NetezzaHandshake = require('./netezza-handshake')

const flushBuffer = serialize.flush()
const syncBuffer = serialize.sync()
const endBuffer = serialize.end()

// Netezza-specific connection implementation
class Connection extends EventEmitter {
  constructor(config) {
    super()
    config = config || {}

    this.stream = config.stream || getStream(config.ssl)
    if (typeof this.stream === 'function') {
      this.stream = this.stream(config)
    }

    this._keepAlive = config.keepAlive
    this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis
    this.lastBuffer = false
    this.parsedStatements = {}
    this.ssl = config.ssl || false
    this._ending = false
    this._emitMessage = false

    // Netezza connection options
    this.database = config.database
    this.user = config.user
    this.password = config.password
    this.securityLevel = config.securityLevel || 0
    this.pgOptions = config.pgOptions
    this.appName = config.appName
    this.debug = config.debug || false

    // Netezza command number for query protocol
    this.commandNumber = -1

    // Log SSL configuration
    if (this.debug) {
      console.log('[Connection] SSL config:', this.ssl)
      console.log('[Connection] Security level:', this.securityLevel)
    }
    const self = this
    this.on('newListener', function (eventName) {
      if (eventName === 'message') {
        self._emitMessage = true
      }
    })
  }

  connect(port, host) {
    const self = this

    this._connecting = true
    this._handshakeComplete = false
    this.stream.setNoDelay(true)
    this.stream.connect(port, host)

    this.stream.once('connect', function () {
      if (self._keepAlive) {
        self.stream.setKeepAlive(true, self._keepAliveInitialDelayMillis)
      }

      // Always perform Netezza handshake (this is a Netezza driver)
      self
        ._performNetezzaHandshake()
        .then((result) => {
          if (self.debug) {
            console.log('[Connection] Handshake completed, setting up message parser')
          }

          // Mark handshake as complete
          self._handshakeComplete = true

          // If stream changed (TLS upgrade), remove old handlers
          if (self.stream !== result.stream) {
            if (self.debug) {
              console.log('[Connection] Stream changed (TLS upgrade), removing old handlers')
            }
            self.stream.removeAllListeners('error')
            self.stream.removeAllListeners('close')
          }

          self.stream = result.stream
          if (self.debug) {
            console.log('[Connection] Updated stream reference after handshake')
          }

          self.commandNumber = 0
          if (self.debug) {
            console.log('[Connection] Initialized Netezza command number to 0')
          }

          // Attach error and close handlers to the new stream
          const reportStreamError = function (error) {
            // errors about disconnections should be ignored during disconnect
            if (self._ending && (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ETIMEDOUT')) {
              return
            }
            self.emit('error', error)
          }
          self.stream.on('error', reportStreamError)

          self.stream.on('close', function () {
            if (self.debug) {
              console.log('[Connection] Stream closed')
            }
            self.emit('end')
          })

          // Attach message listeners AFTER handshake completes
          self.attachListeners(self.stream)

          // Process any remaining buffer data from handshake
          if (result.remainingBuffer && result.remainingBuffer.length > 0) {
            if (self.debug) {
              console.log('[Connection] Processing remaining buffer:', result.remainingBuffer.length, 'bytes')
            }
            self.stream.emit('data', result.remainingBuffer)
          }

          if (self.debug) {
            console.log('[Connection] Emitting readyForQuery event after handshake')
          }
          self.emit('readyForQuery')

          // Emit connect event - client will be marked as connected
          // Initialization queries will be sent by the client after connection
          self.emit('connect')
        })
        .catch((err) => {
          self.emit('error', err)
        })
    })

    const reportStreamError = function (error) {
      // errors about disconnections should be ignored during disconnect
      if (self._ending && (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ETIMEDOUT')) {
        return
      }
      self.emit('error', error)
    }
    this.stream.on('error', reportStreamError)

    this.stream.on('close', function () {
      // Ignore close events during handshake (TLS upgrade can cause underlying socket to close)
      if (!self._handshakeComplete) {
        if (self.debug) {
          console.log('[Connection] Stream closed during handshake (ignored)')
        }
        return
      }
      if (self.debug) {
        console.log('[Connection] Stream closed')
      }
      self.emit('end')
    })
  }

  async _performNetezzaHandshake() {
    if (this.debug) {
      console.log('[Connection] Initiating Netezza handshake protocol')
    }

    const handshake = new NetezzaHandshake(this.stream, this.ssl, {
      appName: this.appName,
      debug: this.debug,
    })

    try {
      const result = await handshake.startup(
        this.database,
        this.securityLevel,
        this.user,
        this.password,
        this.pgOptions
      )
      if (this.debug) {
        console.log('[Connection] Netezza handshake completed')
      }
      return result
    } catch (error) {
      if (this.debug) {
        console.error('[Connection] Netezza handshake failed:', error.message)
      }
      throw new Error(`Netezza handshake failed: ${error.message}`)
    }
  }

  attachListeners(stream) {
    const self = this

    // Parse incoming messages
    // Note: We don't add a separate 'data' listener for debugging because
    // it would interfere with the parser's data listener. Instead, we log
    // parsed messages below.
    parse(stream, (msg) => {
      if (self.debug) {
        console.log('[Connection] Received message:', msg.name, msg.length ? `(${msg.length} bytes)` : '')
      }
      const eventName = msg.name === 'error' ? 'errorMessage' : msg.name
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
      if (this.debug) {
        console.log('[Connection] Stream not writable, cannot send')
      }
      return false
    }
    if (this.debug) {
      console.log(`[Connection] Sending ${buffer.length} bytes to server`)
    }
    return this.stream.write(buffer)
  }

  query(text) {
    if (this.debug) {
      console.log(`[Connection] Sending Netezza query: ${text}`)
    }

    // Use Netezza-specific query format
    if (this.commandNumber !== -1) {
      this.commandNumber++
      if (this.commandNumber > 100000) {
        this.commandNumber = 1
      }

      const message = serialize.netezzaQuery(text, this.commandNumber)

      if (this.debug) {
        console.log(
          `[Connection] Netezza query format: type=P, commandNumber=${this.commandNumber}, length=${message.length}`
        )
        console.log(`[Connection] Query buffer hex: ${message.toString('hex')}`)
        console.log(`[Connection] Query buffer: ${message}`)
      }

      this._send(message)
    } else {
      // Fallback to standard PostgreSQL query format (shouldn't happen for Netezza)
      this._send(serialize.query(text))
    }
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
    this._send(syncBuffer)
  }

  ref() {
    this.stream.ref()
  }

  unref() {
    this.stream.unref()
  }

  end() {
    // 0x58 = 'X'
    this._ending = true
    if (!this._connecting || !this.stream.writable) {
      this.stream.end()
      return
    }

    // Set a timeout to force close the stream if it doesn't close gracefully
    const forceCloseTimeout = setTimeout(() => {
      if (this.debug) {
        console.log('[Connection] Force closing stream after timeout')
      }
      this.stream.destroy()
    }, 1000) // 1 second timeout

    return this.stream.write(endBuffer, () => {
      clearTimeout(forceCloseTimeout)
      this.stream.end()
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
