'use strict'

const EventEmitter = require('events').EventEmitter
const utils = require('./utils')
const nodeUtils = require('util')
const sasl = require('./crypto/sasl')
const TypeOverrides = require('./type-overrides')

const ConnectionParameters = require('./connection-parameters')
const Query = require('./query')
const defaults = require('./defaults')
const Connection = require('./connection')
const crypto = require('./crypto/utils')

const activeQueryDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Client.activeQuery is deprecated and will be removed in a future version.'
)

const queryQueueDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Client.queryQueue is deprecated and will be removed in a future version.'
)

const pgPassDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'pgpass support is deprecated and will be removed in a future version. ' +
    'You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. Within this funciton you can call the pgpass module in your own code.'
)

const byoPromiseDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Passing a custom Promise implementation to the Client/Pool constructor is deprecated and will be removed in a future version.'
)

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

    this.enableChannelBinding = Boolean(c.enableChannelBinding) // set true to use SCRAM-SHA-256-PLUS when offered
    this.connection =
      c.connection ||
      new Connection({
        stream: c.stream,
        ssl: this.connectionParameters.ssl,
        keepAlive: c.keepAlive || false,
        keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
        encoding: this.connectionParameters.client_encoding || 'utf8',
      })
    this._queryQueue = []

    // Pipeline mode configuration
    this._pipelineMode = Boolean(c.pipelineMode) || false

    // Queue for tracking pending query results in pipeline mode
    this._pendingQueries = []

    // Track prepared statements that have been sent but not yet confirmed (for pipeline mode)
    this._pendingParsedStatements = {}

    this.binary = c.binary || defaults.binary
    this.processID = null
    this.secretKey = null
    this.ssl = this.connectionParameters.ssl || false
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

  get pipelineMode() {
    return this._pipelineMode
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

    // Also error all pending queries in pipeline mode
    this._pendingQueries.forEach(enqueueError)
    this._pendingQueries.length = 0

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
        con.requestSsl()
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
    if (typeof this.password === 'function') {
      this._Promise
        .resolve()
        .then(() => this.password())
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
          cb()
        })
        .catch((err) => {
          con.emit('error', err)
        })
    } else if (this.password !== null) {
      cb()
    } else {
      try {
        const pgPass = require('pgpass')
        pgPass(this.connectionParameters, (pass) => {
          if (undefined !== pass) {
            pgPassDeprecationNotice()
            this.connectionParameters.password = this.password = pass
          }
          cb()
        })
      } catch (e) {
        this.emit('error', e)
      }
    }
  }

  _handleAuthCleartextPassword(msg) {
    this._getPassword(() => {
      this.connection.password(this.password)
    })
  }

  _handleAuthMD5Password(msg) {
    this._getPassword(async () => {
      try {
        const hashedPassword = await crypto.postgresMd5PasswordHash(this.user, this.password, msg.salt)
        this.connection.password(hashedPassword)
      } catch (e) {
        this.emit('error', e)
      }
    })
  }

  _handleAuthSASL(msg) {
    this._getPassword(() => {
      try {
        this.saslSession = sasl.startSession(msg.mechanisms, this.enableChannelBinding && this.connection.stream)
        this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response)
      } catch (err) {
        this.connection.emit('error', err)
      }
    })
  }

  async _handleAuthSASLContinue(msg) {
    try {
      await sasl.continueSession(
        this.saslSession,
        this.password,
        msg.data,
        this.enableChannelBinding && this.connection.stream
      )
      this.connection.sendSCRAMClientFinalMessage(this.saslSession.response)
    } catch (err) {
      this.connection.emit('error', err)
    }
  }

  _handleAuthSASLFinal(msg) {
    try {
      sasl.finalizeSession(this.saslSession, msg.data)
      this.saslSession = null
    } catch (err) {
      this.connection.emit('error', err)
    }
  }

  _handleBackendKeyData(msg) {
    this.processID = msg.processID
    this.secretKey = msg.secretKey
  }

  _handleReadyForQuery(msg) {
    if (this._connecting) {
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

    this.readyForQuery = true

    if (this._pipelineMode) {
      // In pipeline mode, complete the current pending query if it has received results
      // The flags check ensures we don't complete a query that hasn't started processing yet
      // (e.g., the initial readyForQuery after connection shouldn't complete pending queries)
      const currentQuery = this._pendingQueries[0]
      if (
        currentQuery &&
        (currentQuery._gotRowDescription || currentQuery._gotError || currentQuery._gotCommandComplete)
      ) {
        this._pendingQueries.shift()
        currentQuery.handleReadyForQuery(this.connection)
      }

      // Check if more queries to send
      this._pulseQueryQueue()

      // Emit drain when all queries complete
      if (this._pendingQueries.length === 0 && this._queryQueue.length === 0) {
        this.emit('drain')
      }
    } else {
      // Existing non-pipeline behavior
      const activeQuery = this._getActiveQuery()
      this._activeQuery = null
      if (activeQuery) {
        activeQuery.handleReadyForQuery(this.connection)
      }
      this._pulseQueryQueue()
    }
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

    if (this._pipelineMode) {
      // In pipeline mode, error affects only the current query
      // The connection remains usable for subsequent queries
      const currentQuery = this._getCurrentPipelineQuery()
      if (currentQuery) {
        // Mark that this query received an error (for pipeline mode completion tracking)
        currentQuery._gotError = true
        currentQuery.handleError(msg, this.connection)
      }
      return
    }

    // Existing non-pipeline error handling
    const activeQuery = this._getActiveQuery()

    if (!activeQuery) {
      this._handleErrorEvent(msg)
      return
    }

    this._activeQuery = null
    activeQuery.handleError(msg, this.connection)
  }

  _handleRowDescription(msg) {
    const activeQuery = this._pipelineMode ? this._getCurrentPipelineQuery() : this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected rowDescription message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // Mark that this query has started receiving results (for pipeline mode completion tracking)
    if (this._pipelineMode) {
      activeQuery._gotRowDescription = true
    }
    // delegate rowDescription to active query
    activeQuery.handleRowDescription(msg)
  }

  _handleDataRow(msg) {
    const activeQuery = this._pipelineMode ? this._getCurrentPipelineQuery() : this._getActiveQuery()
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
    const activeQuery = this._pipelineMode ? this._getCurrentPipelineQuery() : this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected emptyQuery message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // Mark that this query has completed (for pipeline mode completion tracking)
    if (this._pipelineMode) {
      activeQuery._gotCommandComplete = true
    }
    // delegate emptyQuery to active query
    activeQuery.handleEmptyQuery(this.connection)
  }

  _handleCommandComplete(msg) {
    const activeQuery = this._pipelineMode ? this._getCurrentPipelineQuery() : this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected commandComplete message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // Mark that this query has completed (for pipeline mode completion tracking)
    if (this._pipelineMode) {
      activeQuery._gotCommandComplete = true
    }
    // delegate commandComplete to active query
    activeQuery.handleCommandComplete(msg, this.connection)
  }

  _handleParseComplete() {
    const activeQuery = this._pipelineMode ? this._getCurrentPipelineQuery() : this._getActiveQuery()
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
      // Remove from in-flight tracker (pipeline mode) to prevent memory leak
      delete this._pendingParsedStatements[activeQuery.name]
    }
  }

  _handleCopyInResponse(msg) {
    // In pipeline mode, COPY operations are not supported
    if (this._pipelineMode) {
      const activeQuery = this._getCurrentPipelineQuery()
      const error = new Error('COPY operations are not supported in pipeline mode')
      // Send CopyFail to terminate the COPY operation
      this.connection.sendCopyFail('COPY not supported in pipeline mode')
      // Send Sync to get ReadyForQuery and restore connection state
      this.connection.sync()
      if (activeQuery) {
        activeQuery._gotError = true
        activeQuery.handleError(error, this.connection)
      } else {
        this._handleErrorEvent(error)
      }
      return
    }

    // Existing COPY handling for non-pipeline mode
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
    if (this._pipelineMode) {
      // In pipeline mode, we can send queries as soon as we're connected
      // We don't need to wait for readyForQuery between queries
      if (!this._connected) {
        return
      }
      // In pipeline mode, send all queued queries immediately
      // Cork the stream once for all queries to avoid unnecessary cork/uncork per query
      if (this._queryQueue.length > 0) {
        const connection = this.connection
        connection.stream.cork && connection.stream.cork()
        try {
          while (this._queryQueue.length > 0) {
            const query = this._queryQueue.shift()
            this._pendingQueries.push(query)
            this._submitPipelineQuery(query)
          }
        } finally {
          connection.stream.uncork && connection.stream.uncork()
        }
      }
    } else {
      // Existing non-pipeline behavior
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
  }

  // Submit a query using the Extended Query Protocol for pipeline mode
  // Sends Parse/Bind/Describe/Execute/Sync for each query
  // Note: cork/uncork is handled by the caller (_pulseQueryQueue) for batching
  _submitPipelineQuery(query) {
    const connection = this.connection

    // Parse - only if the statement hasn't been parsed before (for named statements)
    // In pipeline mode, we also track "in-flight" prepared statements to avoid
    // sending duplicate Parse commands for the same named statement
    const needsParse = query.name && !query.hasBeenParsed(connection) && !this._pendingParsedStatements[query.name]

    if (!query.name || needsParse) {
      // For unnamed queries, always parse
      // For named queries, only parse if not already parsed or in-flight
      if (query.name) {
        // Track this statement as "in-flight" to prevent duplicate Parse commands
        this._pendingParsedStatements[query.name] = query.text
      }
      connection.parse({
        text: query.text,
        name: query.name,
        types: query.types,
      })
    }

    // Bind - map user values to postgres wire protocol compatible values
    connection.bind({
      portal: query.portal,
      statement: query.name,
      values: query.values,
      binary: query.binary,
      valueMapper: utils.prepareValue,
    })

    // Describe - request description of the portal
    connection.describe({
      type: 'P',
      name: query.portal || '',
    })

    // Execute - execute the query
    connection.execute({
      portal: query.portal,
      rows: query.rows,
    })

    // Sync - establishes synchronization point
    // This tells the server to process all messages up to this point
    connection.sync()
  }

  // Returns the current query being processed in pipeline mode
  // This is the first element of _pendingQueries (the oldest query awaiting results)
  _getCurrentPipelineQuery() {
    return this._pendingQueries[0]
  }

  query(config, values, callback) {
    // can take in strings, config object or query object
    let query
    let result
    let readTimeout
    let readTimeoutTimer
    let queryCallback

    if (config === null || config === undefined) {
      throw new TypeError('Client was passed a null or undefined query')
    } else if (typeof config.submit === 'function') {
      readTimeout = config.query_timeout || this.connectionParameters.query_timeout
      result = query = config
      if (typeof values === 'function') {
        query.callback = query.callback || values
      }
    } else {
      readTimeout = config.query_timeout || this.connectionParameters.query_timeout
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
      }
    }

    if (readTimeout) {
      queryCallback = query.callback || (() => {})

      readTimeoutTimer = setTimeout(() => {
        const error = new Error('Query read timeout')

        process.nextTick(() => {
          query.handleError(error, this.connection)
        })

        queryCallback(error)

        // we already returned an error,
        // just do nothing if query completes
        query.callback = () => {}

        // Remove from queue
        const index = this._queryQueue.indexOf(query)
        if (index > -1) {
          this._queryQueue.splice(index, 1)
        }

        // In pipeline mode, also remove from pending queries
        if (this._pipelineMode) {
          const pendingIndex = this._pendingQueries.indexOf(query)
          if (pendingIndex > -1) {
            this._pendingQueries.splice(pendingIndex, 1)
          }
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

  end(cb) {
    this._ending = true

    // if we have never connected, then end is a noop, callback immediately
    if (!this.connection._connecting || this._ended) {
      if (cb) {
        cb()
      } else {
        return this._Promise.resolve()
      }
    }

    // In pipeline mode, wait for pending queries to complete before ending
    if (this._pipelineMode && this._pendingQueries.length > 0) {
      // Wait for all pending queries to complete (drain event)
      const endConnection = () => {
        this.connection.end()
      }
      this.once('drain', endConnection)

      if (cb) {
        this.connection.once('end', cb)
        return
      } else {
        return new this._Promise((resolve) => {
          this.connection.once('end', resolve)
        })
      }
    }

    if (this._getActiveQuery() || !this._queryable) {
      // if we have an active query we need to force a disconnect
      // on the socket - otherwise a hung query could block end forever
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
