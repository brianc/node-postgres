'use strict'

const EventEmitter = require('events').EventEmitter
const Connection = require('./connection')
const multiHost = require('./multihost')

const PHASE = {
  STARTUP: 'startup',
  PROBE: 'probe',
  DONE: 'done',
}

const PROBE_QUERY = {
  tx_read_only: 'SHOW transaction_read_only',
  is_in_recovery: 'SELECT pg_catalog.pg_is_in_recovery()',
}

function isUnixSocketHost(host) {
  return typeof host === 'string' && host.startsWith('/')
}

function unixSocketPath(host, port) {
  return host.replace(/\/+$/, '') + '/.s.PGSQL.' + port
}

function connectEndpoint(connection, port, host) {
  if (isUnixSocketHost(host)) {
    connection.connect(unixSocketPath(host, port))
    return
  }
  connection.connect(port, host)
}

class MultiConnection extends EventEmitter {
  constructor(config) {
    super()
    this._config = config || {}
    this._targetSessionAttrs = this._config.targetSessionAttrs || null
    this._connection = null
    this._attempt = null
    this._connecting = false
    this._isEnding = false
    this._emitMessage = false

    this.on('newListener', (eventName) => {
      if (eventName === 'message') {
        this._emitMessage = true
      }
    })
  }

  get stream() {
    return this._connection && this._connection.stream
  }

  get parsedStatements() {
    return this._connection && this._connection.parsedStatements
  }

  get host() {
    return this._hosts && this._hosts[this._hostIndex]
  }

  get port() {
    if (!this._ports) {
      return undefined
    }
    return this._ports.length === 1 ? this._ports[0] : this._ports[this._hostIndex]
  }

  get _ending() {
    return this._isEnding
  }

  set _ending(value) {
    this._isEnding = value
    if (this._connection) {
      this._connection._ending = value
    }
  }

  connect(port, host) {
    this._connecting = true
    this._hosts = Array.isArray(host) ? host : [host]
    this._ports = Array.isArray(port) ? port : [port]
    this._hostIndex = 0
    this._preferStandbyPass = 1
    this._needsSessionAttrsCheck = Boolean(this._targetSessionAttrs && this._targetSessionAttrs !== 'any')
    this._probeType = this._needsSessionAttrsCheck ? multiHost.probeType(this._targetSessionAttrs) : null
    this._startAttempt()
  }

  _startAttempt() {
    const connection = new Connection(this._config)
    connection._ending = this._isEnding
    const attempt = {
      connection: connection,
      connected: false,
      phase: PHASE.STARTUP,
      probeRows: [],
      probeError: false,
      backendParams: {},
    }

    this._connection = connection
    this._attempt = attempt

    connection.on('message', (msg) => this._onMessage(attempt, msg))
    connection.once('connect', () => {
      if (attempt !== this._attempt) {
        return
      }
      attempt.connected = true
      this.emit('connect')
    })
    connection.once('sslconnect', () => {
      if (attempt === this._attempt) {
        this.emit('sslconnect')
      }
    })
    connection.on('error', (error) => this._onAttemptError(attempt, error))
    connection.once('end', () => {
      if (attempt === this._attempt) {
        this.emit('end')
      }
    })

    connectEndpoint(connection, this.port, this.host)
  }

  _onAttemptError(attempt, error) {
    if (attempt !== this._attempt) {
      return
    }
    if (this._ending && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
      return
    }
    if (!attempt.connected) {
      this._disposeAttempt(attempt)
      if (this._advanceEndpoint()) {
        this._startAttempt()
        return
      }
    }
    this._connecting = false
    this.emit('error', error)
  }

  _advanceEndpoint() {
    if (this._hostIndex + 1 < this._hosts.length) {
      this._hostIndex++
      return true
    }
    if (this._targetSessionAttrs === 'prefer-standby' && this._preferStandbyPass === 1) {
      this._preferStandbyPass = 2
      this._hostIndex = 0
      return true
    }
    return false
  }

  _onMessage(attempt, msg) {
    if (attempt !== this._attempt) {
      return
    }
    const eventName = msg.name === 'error' ? 'errorMessage' : msg.name

    if (!this._needsSessionAttrsCheck || attempt.phase === PHASE.DONE) {
      this._forwardMessage(msg, eventName)
      return
    }

    if (eventName === 'parameterStatus') {
      attempt.backendParams[msg.parameterName] = msg.parameterValue
      this._forwardMessage(msg, eventName)
      return
    }

    if (attempt.phase === PHASE.STARTUP) {
      if (eventName !== 'readyForQuery') {
        this._forwardMessage(msg, eventName)
        return
      }

      const canDecide = multiHost.canDecideFromParams(this._targetSessionAttrs, attempt.backendParams)
      if (canDecide) {
        if (this._hostMatches(attempt)) {
          this._acceptAttempt(attempt, msg)
        } else {
          this._rejectAttempt(attempt)
        }
        return
      }

      attempt.phase = PHASE.PROBE
      attempt.connection.query(PROBE_QUERY[this._probeType])
      return
    }

    if (eventName === 'dataRow') {
      attempt.probeRows.push(msg)
      return
    }
    if (eventName === 'rowDescription' || eventName === 'commandComplete') {
      return
    }
    if (eventName === 'errorMessage') {
      attempt.probeError = true
      return
    }
    if (eventName !== 'readyForQuery') {
      this._forwardMessage(msg, eventName)
      return
    }

    if (!attempt.probeError && attempt.probeRows.length > 0) {
      attempt.backendParams = multiHost.applyProbeResult(this._probeType, attempt.probeRows[0], attempt.backendParams)
    }

    if (!attempt.probeError && this._hostMatches(attempt)) {
      this._acceptAttempt(attempt, msg)
    } else {
      this._rejectAttempt(attempt)
    }
  }

  _hostMatches(attempt) {
    return multiHost.hostMatches(
      this._targetSessionAttrs,
      attempt.backendParams,
      this._hostIndex,
      this._hosts.length,
      this._preferStandbyPass
    )
  }

  _acceptAttempt(attempt, readyMessage) {
    attempt.phase = PHASE.DONE
    attempt.probeRows = null
    attempt.backendParams = null
    this._forwardMessage(readyMessage, 'readyForQuery')
  }

  _rejectAttempt(attempt) {
    this._disposeAttempt(attempt)
    if (this._advanceEndpoint()) {
      this._startAttempt()
      return
    }
    this._connecting = false
    this.emit('error', new Error('None of the hosts satisfy target_session_attrs="' + this._targetSessionAttrs + '"'))
  }

  _disposeAttempt(attempt) {
    attempt.connection.removeAllListeners()
    // The stream still reports through Connection until teardown finishes.
    // Keep EventEmitter's special "error" event from becoming unhandled.
    attempt.connection.on('error', function () {})
    attempt.connection._ending = true
    if (attempt.connected) {
      attempt.connection.end()
    } else if (typeof attempt.connection.stream.destroy === 'function') {
      attempt.connection.stream.destroy()
    }
  }

  _forwardMessage(msg, eventName) {
    if (this._emitMessage) {
      this.emit('message', msg)
    }
    this.emit(eventName, msg)
  }

  sync() {
    this._ending = true
    return this._connection.sync()
  }

  end() {
    this._ending = true
    return this._connection.end()
  }
}

const delegatedMethods = [
  'requestSsl',
  'startup',
  'cancel',
  'password',
  'sendSASLInitialResponseMessage',
  'sendSCRAMClientFinalMessage',
  'query',
  'parse',
  'bind',
  'execute',
  'flush',
  'ref',
  'unref',
  'close',
  'describe',
  'sendCopyFromChunk',
  'endCopyFrom',
  'sendCopyFail',
]

for (const method of delegatedMethods) {
  MultiConnection.prototype[method] = function (...args) {
    return this._connection[method](...args)
  }
}

module.exports = MultiConnection
