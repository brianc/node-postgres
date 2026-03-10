'use strict'

const EventEmitter = require('events').EventEmitter

const { parse, serialize } = require('pg-protocol')
const { getStream, getSecureStream } = require('./stream')

const flushBuffer = serialize.flush()
const syncBuffer = serialize.sync()
const endBuffer = serialize.end()

// TODO(bmc) support binary mode at some point
class Connection extends EventEmitter {
  constructor(config) {
    super()
    config = config || {}

    if (typeof config.stream === 'function') {
      this._streamFactory = config.stream
      this._config = config
      this.stream = config.stream(config)
    } else {
      this._streamFactory = null
      this._config = null
      this.stream = config.stream || getStream(config.ssl)
    }

    this._keepAlive = config.keepAlive
    this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis
    this.parsedStatements = {}
    this.ssl = config.ssl || false
    this._ending = false
    this._emitMessage = false
    this._targetSessionAttrs = config.targetSessionAttrs || null
    const self = this
    this.on('newListener', function (eventName) {
      if (eventName === 'message') {
        self._emitMessage = true
      }
    })
  }

  _newStream() {
    return this._streamFactory ? this._streamFactory(this._config) : getStream(this.ssl)
  }

  connect(port, host) {
    const self = this

    const hosts = Array.isArray(host) ? host : [host]
    const ports = Array.isArray(port) ? port : [port]
    let hostIndex = 0

    this._connecting = true

    const targetAttrs = this._targetSessionAttrs

    if (targetAttrs && targetAttrs !== 'any') {
      let backendParams = {}
      let fetchingState = false
      let fetchStateRows = []
      let fetchStateError = false

      const origEmit = EventEmitter.prototype.emit.bind(self)

      const tryNextOrFail = () => {
        backendParams = {}
        fetchingState = false
        fetchStateRows = []
        fetchStateError = false
        if (hostIndex + 1 < hosts.length) {
          hostIndex++

          self.stream.removeAllListeners()
          self.stream.destroy()
          self.stream = self._newStream()
          attemptConnect()
        } else {
          self.emit = origEmit
          origEmit('error', new Error(`None of the hosts satisfy the target_session_attrs requirement: ${targetAttrs}`))
        }
      }

      self.emit = function (eventName, ...args) {
        if (eventName === 'parameterStatus') {
          const msg = args[0]
          if (msg) backendParams[msg.parameterName] = msg.parameterValue
          return origEmit(eventName, ...args)
        }

        if (fetchingState) {
          if (eventName === 'dataRow') {
            fetchStateRows.push(args[0])
            return
          }
          if (eventName === 'rowDescription' || eventName === 'commandComplete') {
            return
          }
          if (eventName === 'errorMessage') {
            fetchStateError = true
            return
          }
          if (eventName === 'readyForQuery') {
            fetchingState = false
            if (!fetchStateError && fetchStateRows.length >= 2) {
              const txReadOnly = fetchStateRows[0].fields[0]?.toString('utf8') ?? null
              const isRecovery = fetchStateRows[1].fields[0]?.toString('utf8') ?? null
              if (txReadOnly !== null) backendParams.default_transaction_read_only = txReadOnly
              if (isRecovery !== null) backendParams.in_hot_standby = isRecovery === 't' ? 'on' : 'off'
            }
            fetchStateRows = []
            fetchStateError = false
            if (notHostMatchTargetSessionAttrs(targetAttrs, backendParams, hostIndex, hosts)) {
              tryNextOrFail()
            } else {
              self.emit = origEmit
              origEmit('readyForQuery', args[0])
            }
            return
          }
        }

        if (eventName === 'readyForQuery') {
          if (!backendParams.in_hot_standby || !backendParams.default_transaction_read_only) {
            fetchingState = true
            fetchStateRows = []
            self.query('SHOW transaction_read_only; SELECT pg_catalog.pg_is_in_recovery()')
            return
          }
          if (notHostMatchTargetSessionAttrs(targetAttrs, backendParams, hostIndex, hosts)) {
            tryNextOrFail()
            return
          }
          self.emit = origEmit
          return origEmit('readyForQuery', args[0])
        }

        return origEmit(eventName, ...args)
      }
    }

    const attemptConnect = () => {
      const currentHost = hosts[hostIndex]
      const currentPort = ports[Math.min(hostIndex, ports.length - 1)]
      let connected = false

      self.stream.setNoDelay(true)
      self.stream.connect(currentPort, currentHost)

      self.stream.once('connect', function () {
        connected = true
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

        if (!connected && hostIndex + 1 < hosts.length) {
          hostIndex++
          self.stream.removeAllListeners()
          self.stream.destroy()
          self.stream = self._newStream()
          attemptConnect()
          return
        }
        self.emit('error', error)
      }

      self.stream.on('error', reportStreamError)

      const onClose = function () {
        self.emit('end')
      }
      self.stream.on('close', onClose)

      if (!self.ssl) {
        return self.attachListeners(self.stream)
      }

      self.stream.once('data', function (buffer) {
        const responseCode = buffer.toString('utf8')
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
        const options = {
          socket: self.stream,
        }

        if (self.ssl !== true) {
          Object.assign(options, self.ssl)

          if ('key' in self.ssl) {
            options.key = self.ssl.key
          }
        }

        const net = require('net')
        if (net.isIP && net.isIP(currentHost) === 0) {
          options.servername = currentHost
        }

        // Remove the close listener from the TCP socket before upgrading to TLS.
        // Without this, destroying the TLS stream (during host failover) closes the
        // underlying TCP socket, which fires 'close' → 'end' even though we are
        // still mid-connection to the next host.
        const tcpStream = self.stream
        tcpStream.removeListener('close', onClose)
        tcpStream.removeListener('error', reportStreamError)
        try {
          self.stream = getSecureStream(options)
        } catch (err) {
          return self.emit('error', err)
        }
        self.attachListeners(self.stream)
        self.stream.on('error', reportStreamError)
        self.stream.on('close', onClose)

        self.emit('sslconnect')
      })
    }

    attemptConnect()
  }

  attachListeners(stream) {
    parse(stream, (msg) => {
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
    return this.stream.write(endBuffer, () => {
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

function notHostMatchTargetSessionAttrs(targetAttrs, params, hostIndex, hosts) {
  switch (targetAttrs) {
    case 'read-write':
      return params.in_hot_standby === 'on' || params.default_transaction_read_only === 'on'
    case 'read-only':
      return params.in_hot_standby !== 'on' && params.default_transaction_read_only !== 'on'
    case 'primary':
      return params.in_hot_standby === 'on'
    case 'standby':
      return params.in_hot_standby === 'off'
    case 'prefer-standby':
      return params.in_hot_standby === 'off' && hostIndex + 1 < hosts.length
    default:
      return false
  }
}

module.exports = Connection
