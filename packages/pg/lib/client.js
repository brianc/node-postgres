const EventEmitter = require('events').EventEmitter
const utils = require('./utils')
const nodeUtils = require('util')
const sasl = require('./crypto/sasl')
const { checkAuthRequest, resolveAuthRequirement } = require('./require-auth')
const { normalizeChannelBinding } = require('./channel-binding')
const TypeOverrides = require('./type-overrides')

const ConnectionParameters = require('./connection-parameters')
const Query = require('./query')
const defaults = require('./defaults')
const Connection = require('./connection')
const crypto = require('./crypto/utils')

const activeQueryDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Client.activeQuery is deprecated and will be removed in pg@9.0'
)

const queryQueueDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Client.queryQueue is deprecated and will be removed in pg@9.0.'
)

const pgPassDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'pgpass support is deprecated and will be removed in pg@9.0. ' +
    'You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. Within this function you can call the pgpass module in your own code.'
)

const byoPromiseDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Passing a custom Promise implementation to the Client/Pool constructor is deprecated and will be removed in pg@9.0.'
)

const queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.'
)

function coerceNumberOrDefault(value, defaultValue) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : defaultValue
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : defaultValue
  }
  return defaultValue
}

class Client extends EventEmitter {
  constructor(config) {
    super()

    this.connectionParameters = new ConnectionParameters(config)
    this.user = this.connectionParameters.user
    this.database = this.connectionParameters.database
    this.port = this.connectionParameters.port
    this.host = this.connectionParameters.host

    // "hiding" the password so it doesn't show up in stack traces
    // or if the client is console.logged
    Object.defineProperty(this, 'password', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: this.connectionParameters.password,
    })

    this.replication = this.connectionParameters.replication

    const c = config || {}

    if (c.Promise) {
      byoPromiseDeprecationNotice()
    }
    this._Promise = c.Promise || global.Promise
    this._types = new TypeOverrides(c.types)
    this._ending = false
    this._ended = false
    this._connecting = false
    this._connected = false
    this._connectionError = false
    this._queryable = true
    this._activeQuery = null
    this._txStatus = null

    // Use of SCRAM-SHA-256-PLUS: 'require', 'prefer' (when the server offers it) or
    // 'disable'. ConnectionParameters resolves this from the channel_binding and
    // enableChannelBinding options and the PGCHANNELBINDING environment variable.
    this._channelBinding = this.connectionParameters.channel_binding
    // What the server has to do to authenticate itself, from require_auth and
    // channel_binding, or null if any supported method will do
    this._authRequirement = this.connectionParameters.authRequirement
    // Whether the client has done all the authenticating it is going to do, and whether
    // that included binding the exchange to the server's certificate
    this._authFinished = false
    this._channelBound = false
    // Whether a requirement has been broken, which nothing later can put right. Anything
    // computed for an authentication request has to consult this again before writing its
    // answer: hashing a password and computing a SCRAM proof each take a turn of the event
    // loop, and Connection#end() sends its Terminate before ending the stream, so a write
    // that arrived in the meantime would still reach the server.
    this._authAborted = false
    this.scramMaxIterations = coerceNumberOrDefault(c.scramMaxIterations, sasl.DEFAULT_MAX_SCRAM_ITERATIONS)
    this.connection =
      c.connection ||
      new Connection({
        stream: c.stream,
        ssl: this.connectionParameters.ssl,
        sslNegotiation: this.connectionParameters.sslnegotiation,
        keepAlive: c.keepAlive || false,
        keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
        encoding: this.connectionParameters.client_encoding || 'utf8',
      })
    this._queryQueue = []
    this._sentQueryQueue = []
    this.pipeline = Boolean(c.pipeline)
    this.binary = c.binary || defaults.binary
    this.processID = null
    this.secretKey = null
    this.ssl = this.connectionParameters.ssl || false
    this.sslNegotiation = this.connectionParameters.sslnegotiation || 'postgres'
    // As with Password, make SSL->Key (the private key) non-enumerable.
    // It won't show up in stack traces
    // or if the client is console.logged
    if (this.ssl && this.ssl.key) {
      Object.defineProperty(this.ssl, 'key', {
        enumerable: false,
      })
    }

    this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0
  }

  get channelBinding() {
    return this._channelBinding
  }

  // Changing the level after construction re-derives what the server has to do, so that
  // the two cannot come to disagree over whether channel binding is mandatory. The value
  // is checked as it would have been in the constructor, so that a level this client does
  // not know cannot pass for the weakest one.
  set channelBinding(value) {
    this._channelBinding = normalizeChannelBinding(value)
    this._authRequirement = resolveAuthRequirement(this.connectionParameters.require_auth, this._channelBinding)
  }

  // Kept in step with channelBinding, since this was the option's original name and
  // shape. Levels pass through, so assigning 'require' does not weaken to 'prefer', and
  // booleans mean what they always did.
  get enableChannelBinding() {
    return this.channelBinding !== 'disable'
  }

  set enableChannelBinding(value) {
    this.channelBinding = value
  }

  get activeQuery() {
    activeQueryDeprecationNotice()
    return this._activeQuery
  }

  set activeQuery(val) {
    activeQueryDeprecationNotice()
    this._activeQuery = val
  }

  _getActiveQuery() {
    return this._activeQuery
  }

  _errorAllQueries(err) {
    const enqueueError = (query) => {
      process.nextTick(() => {
        query.handleError(err, this.connection)
      })
    }

    const activeQuery = this._getActiveQuery()
    if (activeQuery) {
      enqueueError(activeQuery)
      this._activeQuery = null
    }

    this._sentQueryQueue.forEach(enqueueError)
    this._sentQueryQueue.length = 0

    this._queryQueue.forEach(enqueueError)
    this._queryQueue.length = 0
  }

  _connect(callback) {
    const self = this
    const con = this.connection
    this._connectionCallback = callback

    if (this._connecting || this._connected) {
      const err = new Error('Client has already been connected. You cannot reuse a client.')
      process.nextTick(() => {
        callback(err)
      })
      return
    }
    this._connecting = true

    if (this._connectionTimeoutMillis > 0) {
      this.connectionTimeoutHandle = setTimeout(() => {
        con._ending = true
        con.stream.destroy(new Error('timeout expired'))
      }, this._connectionTimeoutMillis)

      if (this.connectionTimeoutHandle.unref) {
        this.connectionTimeoutHandle.unref()
      }
    }

    if (this.host && this.host.indexOf('/') === 0) {
      con.connect(this.host + '/.s.PGSQL.' + this.port)
    } else {
      con.connect(this.port, this.host)
    }

    // once connection is established send startup message
    con.on('connect', function () {
      if (self.ssl) {
        // With direct SSL negotiation the connection upgrades to TLS without an
        // SSLRequest packet, so the startup message is sent after 'sslconnect'.
        if (self.sslNegotiation !== 'direct') {
          con.requestSsl()
        }
      } else {
        con.startup(self.getStartupConf())
      }
    })

    con.on('sslconnect', function () {
      con.startup(self.getStartupConf())
    })

    this._attachListeners(con)

    con.once('end', () => {
      const error = this._ending ? new Error('Connection terminated') : new Error('Connection terminated unexpectedly')

      clearTimeout(this.connectionTimeoutHandle)
      this._errorAllQueries(error)
      this._ended = true

      if (!this._ending) {
        // if the connection is ended without us calling .end()
        // on this client then we have an unexpected disconnection
        // treat this as an error unless we've already emitted an error
        // during connection.
        if (this._connecting && !this._connectionError) {
          if (this._connectionCallback) {
            this._connectionCallback(error)
          } else {
            this._handleErrorEvent(error)
          }
        } else if (!this._connectionError) {
          this._handleErrorEvent(error)
        }
      }

      process.nextTick(() => {
        this.emit('end')
      })
    })
  }

  connect(callback) {
    if (callback) {
      this._connect(callback)
      return
    }

    return new this._Promise((resolve, reject) => {
      this._connect((error) => {
        if (error) {
          reject(error)
        } else {
          resolve(this)
        }
      })
    })
  }

  _attachListeners(con) {
    // password request handling
    con.on('authenticationCleartextPassword', this._handleAuthCleartextPassword.bind(this))
    // password request handling
    con.on('authenticationMD5Password', this._handleAuthMD5Password.bind(this))
    // password request handling (SASL)
    con.on('authenticationSASL', this._handleAuthSASL.bind(this))
    con.on('authenticationSASLContinue', this._handleAuthSASLContinue.bind(this))
    con.on('authenticationSASLFinal', this._handleAuthSASLFinal.bind(this))
    con.on('authenticationOk', this._handleAuthenticationOk.bind(this))
    con.on('backendKeyData', this._handleBackendKeyData.bind(this))
    con.on('error', this._handleErrorEvent.bind(this))
    con.on('errorMessage', this._handleErrorMessage.bind(this))
    con.on('readyForQuery', this._handleReadyForQuery.bind(this))
    con.on('notice', this._handleNotice.bind(this))
    con.on('rowDescription', this._handleRowDescription.bind(this))
    con.on('dataRow', this._handleDataRow.bind(this))
    con.on('portalSuspended', this._handlePortalSuspended.bind(this))
    con.on('emptyQuery', this._handleEmptyQuery.bind(this))
    con.on('commandComplete', this._handleCommandComplete.bind(this))
    con.on('parseComplete', this._handleParseComplete.bind(this))
    con.on('copyInResponse', this._handleCopyInResponse.bind(this))
    con.on('copyData', this._handleCopyData.bind(this))
    con.on('notification', this._handleNotification.bind(this))
  }

  _getPassword(cb) {
    const con = this.connection
    // Looking a password up can be asynchronous, and a requirement can be broken while it
    // is in flight, so what was permitted when the lookup began is checked again before
    // anything is answered with.
    const answer = () => {
      if (this._authAborted) {
        return
      }
      cb()
    }

    if (typeof this.password === 'function') {
      this._Promise
        .resolve()
        .then(() => this.password(this.connectionParameters))
        .then((pass) => {
          if (pass !== undefined) {
            if (typeof pass !== 'string') {
              con.emit('error', new TypeError('Password must be a string'))
              return
            }
            this.connectionParameters.password = this.password = pass
          } else {
            this.connectionParameters.password = this.password = null
          }
          answer()
        })
        .catch((err) => {
          con.emit('error', err)
        })
    } else if (this.password !== null) {
      answer()
    } else {
      try {
        const pgPass = require('pgpass')
        pgPass(this.connectionParameters, (pass) => {
          if (undefined !== pass) {
            pgPassDeprecationNotice()
            this.connectionParameters.password = this.password = pass
          }
          answer()
        })
      } catch (e) {
        this.emit('error', e)
      }
    }
  }

  // Fails the connection: the caller hears of the error through connect(), and the
  // connection is closed so that a server which carries on regardless cannot reach a
  // usable session. The messages that carry on regardless may already be here, since a
  // server can pipeline the whole of a successful login into one packet, so the failure
  // is recorded rather than left to be inferred from the connection being closed.
  _abortAuthentication(err) {
    this._authAborted = true
    this._queryable = false
    this.connection.emit('error', err)
    this.connection.end()
  }

  // Mirrors libpq's check_expected_areq. Every authentication request is judged here
  // before the client answers it, or even looks up a password, so that a server cannot
  // escape a requirement by asking for a method whose handler forgot to check. That was
  // CVE-2025-49146: pgjdbc honored channel_binding=require within a SCRAM exchange, but
  // a server could ask for a plain password instead and face no such requirement.
  _authRequestAllowed(method) {
    // Nothing is answered once a requirement has been broken, not even a request that
    // would have been permitted on its own: the connection is already on its way out.
    if (this._authAborted) {
      return false
    }

    // Authentication happens once. The server asks for one method and then says whether
    // it was enough, so a further request means a server after something it has not been
    // given: the password itself, say, from a client that had proved knowing it through
    // SCRAM. Postgres stores only a SCRAM verifier, and someone in the middle holding a
    // stolen one can complete that exchange, so what is asked for here is worth refusing
    // whatever require_auth says.
    if (this._authFinished && method !== 'none') {
      this._abortAuthentication(
        new Error(`The server requested ${method} authentication after the client had already authenticated`)
      )
      return false
    }

    const reason = checkAuthRequest({
      requirement: this._authRequirement,
      method,
      authFinished: this._authFinished,
      channelBound: this._channelBound,
    })

    if (reason === null) {
      return true
    }

    this._abortAuthentication(new Error(reason))
    return false
  }

  _handleAuthCleartextPassword(msg) {
    if (!this._authRequestAllowed('password')) return

    this._getPassword(() => {
      this.connection.password(this.password)
      // as in libpq: having sent a password, we expect no further authentication request
      this._authFinished = true
    })
  }

  _handleAuthMD5Password(msg) {
    if (!this._authRequestAllowed('md5')) return

    this._getPassword(async () => {
      try {
        const hashedPassword = await crypto.postgresMd5PasswordHash(this.user, this.password, msg.salt)
        if (this._authAborted) return
        this.connection.password(hashedPassword)
        this._authFinished = true
      } catch (e) {
        this.emit('error', e)
      }
    })
  }

  _handleAuthSASL(msg) {
    if (!this._authRequestAllowed('scram-sha-256')) return

    this._getPassword(() => {
      try {
        this.saslSession = sasl.startSession(msg.mechanisms, {
          channelBinding: this.channelBinding,
          sslInUse: Boolean(this.ssl),
          stream: this.connection.stream,
          scramMaxIterations: this.scramMaxIterations,
        })
        this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response)
      } catch (err) {
        this._abortAuthentication(err)
      }
    })
  }

  async _handleAuthSASLContinue(msg) {
    if (!this._authRequestAllowed('scram-sha-256')) return

    try {
      await sasl.continueSession(this.saslSession, this.password, msg.data, this.connection.stream)
      if (this._authAborted) return
      this.connection.sendSCRAMClientFinalMessage(this.saslSession.response)
    } catch (err) {
      this._abortAuthentication(err)
    }
  }

  _handleAuthSASLFinal(msg) {
    if (!this._authRequestAllowed('scram-sha-256')) return

    try {
      const { mechanism } = this.saslSession
      sasl.finalizeSession(this.saslSession, msg.data)
      this.saslSession = null
      // The server has proved that it holds the verifier for our password, and with
      // SCRAM-SHA-256-PLUS that proof is tied to the certificate of this TLS session.
      this._authFinished = true
      this._channelBound = mechanism === 'SCRAM-SHA-256-PLUS'
    } catch (err) {
      this._abortAuthentication(err)
    }
  }

  _handleAuthenticationOk() {
    // 'none' is require_auth's name for a connection involving no authentication
    // request, which is what this message amounts to if nothing preceded it
    this._authRequestAllowed('none')
  }

  _handleBackendKeyData(msg) {
    this.processID = msg.processID
    this.secretKey = msg.secretKey
  }

  _handleReadyForQuery(msg) {
    if (this._connecting) {
      // A server that declares the client logged in anyway does not get to make it so:
      // this message may have arrived in the same packet as the request that was refused,
      // and reporting a successful connection now would undo the refusal.
      if (this._authAborted) {
        return
      }

      // The last word on any requirement, since this is where the connection becomes
      // usable. An AuthenticationOk is judged as it arrives, but a server can reach this
      // point without having sent one: unlike libpq, which accepts nothing but an
      // authentication request at this stage of its handshake, this client is listening
      // for every message from the start. 'none' is require_auth's name for a connection
      // that involved no authentication request at all.
      if (!this._authRequestAllowed('none')) {
        return
      }

      this._connecting = false
      this._connected = true
      clearTimeout(this.connectionTimeoutHandle)

      // process possible callback argument to Client#connect
      if (this._connectionCallback) {
        this._connectionCallback(null, this)
        // remove callback for proper error handling
        // after the connect event
        this._connectionCallback = null
      }
      this.emit('connect')
    }
    const activeQuery = this._getActiveQuery()
    this._activeQuery = null
    this._txStatus = msg?.status ?? null
    this.readyForQuery = true
    if (activeQuery) {
      activeQuery.handleReadyForQuery(this.connection)
    }
    this._pulseQueryQueue()
  }

  // if we receive an error event or error message
  // during the connection process we handle it here
  _handleErrorWhileConnecting(err) {
    if (this._connectionError) {
      // TODO(bmc): this is swallowing errors - we shouldn't do this
      return
    }
    this._connectionError = true
    clearTimeout(this.connectionTimeoutHandle)
    if (this._connectionCallback) {
      return this._connectionCallback(err)
    }
    this.emit('error', err)
  }

  // if we're connected and we receive an error event from the connection
  // this means the socket is dead - do a hard abort of all queries and emit
  // the socket error on the client as well
  _handleErrorEvent(err) {
    if (this._connecting) {
      return this._handleErrorWhileConnecting(err)
    }
    this._queryable = false
    this._errorAllQueries(err)
    this.emit('error', err)
  }

  // handle error messages from the postgres backend
  _handleErrorMessage(msg) {
    if (this._connecting) {
      return this._handleErrorWhileConnecting(msg)
    }
    const activeQuery = this._getActiveQuery()

    if (!activeQuery) {
      this._handleErrorEvent(msg)
      return
    }

    this._activeQuery = null
    if (activeQuery.name) {
      delete this.connection.submittedNamedStatements[activeQuery.name]
    }
    activeQuery.handleError(msg, this.connection)
  }

  _handleRowDescription(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected rowDescription message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate rowDescription to active query
    activeQuery.handleRowDescription(msg)
  }

  _handleDataRow(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected dataRow message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate dataRow to active query
    activeQuery.handleDataRow(msg)
  }

  _handlePortalSuspended(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected portalSuspended message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate portalSuspended to active query
    activeQuery.handlePortalSuspended(this.connection)
  }

  _handleEmptyQuery(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected emptyQuery message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate emptyQuery to active query
    activeQuery.handleEmptyQuery(this.connection)
  }

  _handleCommandComplete(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected commandComplete message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate commandComplete to active query
    activeQuery.handleCommandComplete(msg, this.connection)
  }

  _handleParseComplete() {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected parseComplete message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // if a prepared statement has a name and properly parses
    // we track that its already been executed so we don't parse
    // it again on the same client
    if (activeQuery.name) {
      this.connection.parsedStatements[activeQuery.name] = activeQuery.text
      delete this.connection.submittedNamedStatements[activeQuery.name]
    }
  }

  _handleCopyInResponse(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected copyInResponse message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleCopyInResponse(this.connection)
  }

  _handleCopyData(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected copyData message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleCopyData(msg, this.connection)
  }

  _handleNotification(msg) {
    this.emit('notification', msg)
  }

  _handleNotice(msg) {
    this.emit('notice', msg)
  }

  getStartupConf() {
    const params = this.connectionParameters

    const data = {
      user: params.user,
      database: params.database,
    }

    const appName = params.application_name || params.fallback_application_name
    if (appName) {
      data.application_name = appName
    }
    if (params.replication) {
      data.replication = '' + params.replication
    }
    if (params.statement_timeout) {
      data.statement_timeout = String(parseInt(params.statement_timeout, 10))
    }
    if (params.lock_timeout) {
      data.lock_timeout = String(parseInt(params.lock_timeout, 10))
    }
    if (params.idle_in_transaction_session_timeout) {
      data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10))
    }
    if (params.options) {
      data.options = params.options
    }

    return data
  }

  cancel(client, query) {
    if (client.activeQuery === query) {
      const con = this.connection

      if (this.host && this.host.indexOf('/') === 0) {
        con.connect(this.host + '/.s.PGSQL.' + this.port)
      } else {
        con.connect(this.port, this.host)
      }

      // once connection is established send cancel message
      con.on('connect', function () {
        con.cancel(client.processID, client.secretKey)
      })
    } else if (client._queryQueue.indexOf(query) !== -1) {
      client._queryQueue.splice(client._queryQueue.indexOf(query), 1)
    } else if (client._sentQueryQueue.indexOf(query) !== -1) {
      // Query already sent on wire — can't remove it without corrupting the
      // pipeline. No-op the callback so the result is silently discarded.
      query.callback = () => {}
    }
  }

  setTypeParser(oid, format, parseFn) {
    return this._types.setTypeParser(oid, format, parseFn)
  }

  getTypeParser(oid, format) {
    return this._types.getTypeParser(oid, format)
  }

  // escapeIdentifier and escapeLiteral moved to utility functions & exported
  // on PG
  // re-exported here for backwards compatibility
  escapeIdentifier(str) {
    return utils.escapeIdentifier(str)
  }

  escapeLiteral(str) {
    return utils.escapeLiteral(str)
  }

  _pulseQueryQueue() {
    if (this.pipeline) {
      this._pulsePipelinedQueryQueue()
      return
    }
    if (this.readyForQuery === true) {
      this._activeQuery = this._queryQueue.shift()
      const activeQuery = this._getActiveQuery()
      if (activeQuery) {
        this.readyForQuery = false
        this.hasExecuted = true

        const queryError = activeQuery.submit(this.connection)
        if (queryError) {
          process.nextTick(() => {
            activeQuery.handleError(queryError, this.connection)
            this.readyForQuery = true
            this._pulseQueryQueue()
          })
        }
      } else if (this.hasExecuted) {
        this._activeQuery = null
        this.emit('drain')
      }
    }
  }

  _pulsePipelinedQueryQueue() {
    if (!this._connected || !this._queryable) {
      return
    }
    while (this._queryQueue.length > 0) {
      const query = this._queryQueue.shift()
      this.hasExecuted = true
      const queryError = query.submit(this.connection)
      if (queryError) {
        process.nextTick(() => {
          query.handleError(queryError, this.connection)
        })
        continue
      }
      this._sentQueryQueue.push(query)
    }
    if (this.readyForQuery && !this._activeQuery && this._sentQueryQueue.length > 0) {
      this._activeQuery = this._sentQueryQueue.shift()
      this.readyForQuery = false
    }
    if (!this._activeQuery && this._sentQueryQueue.length === 0 && this._queryQueue.length === 0 && this.hasExecuted) {
      this.emit('drain')
    }
  }

  query(config, values, callback) {
    // can take in strings, config object or query object
    let query
    let result

    if (config == null) {
      throw new TypeError('Client was passed a null or undefined query')
    }

    if (typeof config.submit === 'function') {
      result = query = config
      if (!query.callback) {
        if (typeof values === 'function') {
          query.callback = values
        } else if (callback) {
          query.callback = callback
        }
      }
    } else {
      query = new Query(config, values, callback)
      if (!query.callback) {
        result = new this._Promise((resolve, reject) => {
          query.callback = (err, res) => (err ? reject(err) : resolve(res))
        }).catch((err) => {
          // replace the stack trace that leads to `TCP.onStreamRead` with one that leads back to the
          // application that created the query
          Error.captureStackTrace(err)
          throw err
        })
      } else if (typeof query.callback !== 'function') {
        throw new TypeError('callback is not a function')
      }
    }

    const readTimeout = config.query_timeout || this.connectionParameters.query_timeout
    if (readTimeout) {
      const queryCallback = query.callback || (() => {})

      const readTimeoutTimer = setTimeout(() => {
        const error = new Error('Query read timeout')

        process.nextTick(() => {
          query.handleError(error, this.connection)
        })

        queryCallback(error)

        // we already returned an error,
        // just do nothing if query completes
        query.callback = () => {}

        // Remove from queue (only safe if not yet sent)
        const index = this._queryQueue.indexOf(query)
        if (index > -1) {
          this._queryQueue.splice(index, 1)
        } else if (this.pipeline) {
          // Query already sent — the pipeline is blocked until it completes.
          // Destroy the connection to unblock all remaining pipelined queries.
          this.connection.stream.destroy()
          return
        }

        this._pulseQueryQueue()
      }, readTimeout)

      query.callback = (err, res) => {
        clearTimeout(readTimeoutTimer)
        queryCallback(err, res)
      }
    }

    if (this.binary && !query.binary) {
      query.binary = true
    }

    if (query._result && !query._result._types) {
      query._result._types = this._types
    }

    // A query that keeps a portal open across round trips cannot share a pipelined connection: the
    // queries written behind it are answered out of its portal, so rows land on the wrong query and
    // the reads that follow fail with 'portal does not exist'. Refuse it instead of corrupting.
    if (this.pipeline) {
      const portalQuery =
        typeof config.submit === 'function' && !(query instanceof Query)
          ? 'Custom query classes such as pg-cursor and pg-query-stream are'
          : query.rows
          ? 'The `rows` option is'
          : null
      if (portalQuery) {
        process.nextTick(() => {
          query.handleError(new Error(`${portalQuery} not supported in pipeline mode`), this.connection)
        })
        return result
      }
    }

    if (!this._queryable) {
      process.nextTick(() => {
        query.handleError(new Error('Client has encountered a connection error and is not queryable'), this.connection)
      })
      return result
    }

    if (this._ending) {
      process.nextTick(() => {
        query.handleError(new Error('Client was closed and is not queryable'), this.connection)
      })
      return result
    }

    if (this._queryQueue.length > 0 && !this.pipeline) {
      queryQueueLengthDeprecationNotice()
    }
    this._queryQueue.push(query)
    this._pulseQueryQueue()
    return result
  }

  ref() {
    this.connection.ref()
  }

  unref() {
    this.connection.unref()
  }

  getTransactionStatus() {
    return this._txStatus
  }

  end(cb) {
    this._ending = true

    // if we have never connected, then end is a noop, callback immediately
    if (!this.connection._connecting || this._ended) {
      if (cb) {
        cb()
        return
      } else {
        return this._Promise.resolve()
      }
    }

    if (!this._queryable) {
      // socket is dead — force close
      this.connection.stream.destroy()
    } else if (
      this.pipeline &&
      (this._getActiveQuery() || this._sentQueryQueue.length > 0 || this._queryQueue.length > 0)
    ) {
      // pipelined queries are already on the wire (or queued to send) and will
      // complete normally; wait for drain then do a graceful goodbye
      this.once('drain', () => this.connection.end())
    } else if (this._getActiveQuery()) {
      // non-pipeline: a hung query could block end forever — force disconnect
      this.connection.stream.destroy()
    } else {
      this.connection.end()
    }

    if (cb) {
      this.connection.once('end', cb)
    } else {
      return new this._Promise((resolve) => {
        this.connection.once('end', resolve)
      })
    }
  }
  get queryQueue() {
    queryQueueDeprecationNotice()
    return this._queryQueue
  }
}

// expose a Query constructor
Client.Query = Query

module.exports = Client
