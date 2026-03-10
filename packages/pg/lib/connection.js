'use strict'

const net = require('net')
const EventEmitter = require('events').EventEmitter
const { parse, serialize } = require('pg-protocol')
const { getStream, getSecureStream } = require('./stream')
const MultiHost = require('./multihost')

const flushBuffer = serialize.flush()
const syncBuffer = serialize.sync()
const endBuffer = serialize.end()

// TODO(bmc) support binary mode at some point
const PROBE_SHOW_TX_READ_ONLY = serialize.query('SHOW transaction_read_only')
const PROBE_SELECT_RECOVERY = serialize.query('SELECT pg_catalog.pg_is_in_recovery()')

const PHASE = {
  STARTUP: 'startup',
  PROBE: 'probe',
  DONE: 'done',
}

class Connection extends EventEmitter {
  constructor(config) {
    super()
    config = config || {}

    this.stream = config.stream || getStream(config.ssl)
    if (typeof this.stream === 'function') {
      this._streamFactory = this.stream
      this._config = config
      this.stream = this._streamFactory(config)
    } else {
      this._streamFactory = null
      this._config = null
    }

    this._keepAlive = config.keepAlive
    this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis
    this.parsedStatements = {}
    this.ssl = config.ssl || false
    this._ending = false
    this._emitMessage = false
    this._targetSessionAttrs = config.targetSessionAttrs || null
    this._trustParameterStatus = config.trustParameterStatus || false
    this.host = null
    this.port = null
    this._streamErrorHandler = this._onStreamError.bind(this)
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
    this._connecting = true
    this._hosts = Array.isArray(host) ? host : [host]
    this._ports = Array.isArray(port) ? port : [port]
    this._hostIndex = 0
    // prefer-standby: two-pass logic (libpq style)
    // Pass 1: look for standby among all hosts
    // Pass 2: if no standby found, accept any host
    this._preferStandbyPass = 1
    this._connectedToHost = false
    this._needsSessionAttrsCheck = this._targetSessionAttrs && this._targetSessionAttrs !== 'any'
    this._probeType = this._needsSessionAttrsCheck ? MultiHost.probeType(this._targetSessionAttrs) : null
    // stored so removeListener can find them by reference (needed for SSL stream swap)
    this._connectErrorHandler = (err) => this._onConnectError(err)
    this._connectCloseHandler = () => this.emit('end')
    this._attemptConnect()
  }

  _attemptConnect() {
    this._connectedToHost = false
    this.host = this._hosts[this._hostIndex]
    this.port = this._ports.length === 1 ? this._ports[0] : this._ports[this._hostIndex]

    this.stream.setNoDelay(true)
    this.stream.connect(this.port, this.host)
    this.stream.on('error', this._connectErrorHandler)
    this.stream.on('close', this._connectCloseHandler)
    this.stream.once('connect', () => this._onTcpConnect())

    if (this.ssl) {
      this.stream.once('data', (buffer) => this._onSslData(buffer))
    }
  }

  _onTcpConnect() {
    this._connectedToHost = true
    if (this._keepAlive) {
      this.stream.setKeepAlive(true, this._keepAliveInitialDelayMillis)
    }
    if (!this.ssl) {
      this._attachProbeOrPlain()
    }
    this.emit('connect')
  }

  _onSslData(buffer) {
    const responseCode = buffer.toString('utf8')

    if (responseCode === 'N') {
      this.stream.end()
      this.emit('error', new Error('The server does not support SSL connections'))
      return
    }
    if (responseCode !== 'S') {
      // Any other response byte, including 'E' (ErrorResponse) indicating a server error
      this.stream.end()
      this.emit('error', new Error('There was an error establishing an SSL connection'))
      return
    }

    const options = {
      socket: this.stream,
    }

    if (this.ssl !== true) {
      Object.assign(options, this.ssl)

      if ('key' in this.ssl) {
        options.key = this.ssl.key
      }
    }

    if (net.isIP && net.isIP(this.host) === 0) {
      options.servername = this.host
    }

    const tcpStream = this.stream
    tcpStream.removeListener('error', this._connectErrorHandler)
    tcpStream.removeListener('close', this._connectCloseHandler)
    try {
      this.stream = getSecureStream(options)
    } catch (err) {
      this.emit('error', err)
      return
    }
    this.stream.on('error', this._connectErrorHandler)
    this.stream.on('close', this._connectCloseHandler)
    this._attachProbeOrPlain()
    this.emit('sslconnect')
  }

  _advanceHosts() {
    if (this._hostIndex + 1 < this._hosts.length) {
      this._hostIndex++
      this._resetConnectStream()
      this._attemptConnect()
      return true
    }
    if (this._targetSessionAttrs === 'prefer-standby' && this._preferStandbyPass === 1) {
      this._preferStandbyPass = 2
      this._hostIndex = 0
      this._resetConnectStream()
      this._attemptConnect()
      return true
    }
    return false
  }

  _tryNextHostOrFail() {
    if (this._advanceHosts()) {
      return
    }
    this._connecting = false
    this.stream.removeListener('close', this._connectCloseHandler)
    this.stream.removeListener('error', this._connectErrorHandler)
    this._send(endBuffer)
    this.stream.destroy()
    this.emit('error', new Error('None of the hosts satisfy target_session_attrs="' + this._targetSessionAttrs + '"'))
  }

  _onConnectError(error) {
    // errors about disconnections should be ignored during disconnect
    if (this._ending && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
      return
    }
    if (!this._connectedToHost && this._advanceHosts()) {
      return
    }
    this._connecting = false
    this.emit('error', error)
  }

  _attachProbeOrPlain() {
    if (this._needsSessionAttrsCheck) {
      this._runSessionAttrsCheck()
    } else {
      this._releaseConnectScope(this._connectErrorHandler)
      this.attachListeners(this.stream)
    }
  }

  _resetConnectStream() {
    this._send(endBuffer)
    this.stream.removeAllListeners()
    this.stream.destroy()
    this.stream = this._newStream()
  }

  _runSessionAttrsCheck() {
    const checkState = {
      phase: PHASE.STARTUP,
      probeRows: [],
      probeError: false,
      backendParams: {},
    }
    parse(this.stream, (msg) => this._onSessionCheckMessage(checkState, msg))
  }

  _onSessionCheckMessage(checkState, msg) {
    const eventName = msg.name === 'error' ? 'errorMessage' : msg.name

    if (checkState.phase === PHASE.DONE) {
      this._forwardMessage(msg, eventName)
      return
    }

    if (eventName === 'parameterStatus') {
      checkState.backendParams[msg.parameterName] = msg.parameterValue
      this._forwardMessage(msg, eventName)
      return
    }

    if (checkState.phase === PHASE.STARTUP && eventName !== 'readyForQuery') {
      this._forwardMessage(msg, eventName)
      return
    }

    if (checkState.phase === PHASE.STARTUP) {
      const canDecide =
        this._trustParameterStatus && MultiHost.canDecideFromParams(this._targetSessionAttrs, checkState.backendParams)
      const currentHostMatches =
        canDecide &&
        MultiHost.hostMatches(
          this._targetSessionAttrs,
          checkState.backendParams,
          this._hostIndex,
          this._hosts.length,
          this._preferStandbyPass
        )

      if (canDecide && !currentHostMatches) {
        this._tryNextHostOrFail()
        return
      }
      if (canDecide) {
        this._finishSessionCheck(checkState, msg)
        return
      }

      checkState.phase = PHASE.PROBE
      this._send(this._probeType === 'tx_read_only' ? PROBE_SHOW_TX_READ_ONLY : PROBE_SELECT_RECOVERY)
      return
    }

    // Probe phase: intercept response — don't emit to client
    if (eventName === 'dataRow') {
      checkState.probeRows.push(msg)
      return
    }
    if (eventName === 'rowDescription' || eventName === 'commandComplete') {
      return
    }
    if (eventName === 'errorMessage') {
      checkState.probeError = true
      return
    }
    if (eventName === 'readyForQuery') {
      if (!checkState.probeError && checkState.probeRows.length >= 1) {
        checkState.backendParams = MultiHost.applyProbeResult(
          this._probeType,
          checkState.probeRows[0],
          checkState.backendParams
        )
      }

      const currentHostMatches =
        !checkState.probeError &&
        MultiHost.hostMatches(
          this._targetSessionAttrs,
          checkState.backendParams,
          this._hostIndex,
          this._hosts.length,
          this._preferStandbyPass
        )
      if (!currentHostMatches) {
        this._tryNextHostOrFail()
        return
      }

      this._finishSessionCheck(checkState, msg)
    }
  }

  _finishSessionCheck(checkState, readyMsg) {
    this._releaseConnectScope(this._connectErrorHandler)
    this._connecting = false
    checkState.backendParams = checkState.probeRows = null
    checkState.phase = PHASE.DONE
    if (this._emitMessage) {
      this.emit('message', readyMsg)
    }
    this.emit('readyForQuery', readyMsg)
  }

  _forwardMessage(msg, eventName) {
    if (this._emitMessage) {
      this.emit('message', msg)
    }
    this.emit(eventName, msg)
  }

  _onStreamError(error) {
    if (this._ending && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
      return
    }
    this.emit('error', error)
  }

  _releaseConnectScope(reportStreamError) {
    this.stream.removeListener('error', reportStreamError)
    this.stream.on('error', this._streamErrorHandler)
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

module.exports = Connection
