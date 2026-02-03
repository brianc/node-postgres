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

    // Pipeline mode configuration
    this._pipelineMode = this.connectionParameters.pipelineMode
    this._pipelineBatchSize = this.connectionParameters.pipelineBatchSize
    this._pipelineBatchTimeout = this.connectionParameters.pipelineBatchTimeout

    // Pipeline state
    // Pipeline state
    this._activePipelineBatch = [] // Queries being buffered (sent but no Sync)
    this._pendingPipelineBatches = [] // Batches sent with Sync, awaiting results
    this._pipelineSyncTimer = null
    this._pipelineCurrentIndex = 0 // Index into _pendingPipelineBatches[0]
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

  /**
   * Check if pipeline mode is enabled
   */
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

    // Clear pipeline pending queries
    this._activePipelineBatch.forEach(enqueueError)
    this._activePipelineBatch.length = 0
    this._pendingPipelineBatches.forEach((batch) => batch.forEach(enqueueError))
    this._pendingPipelineBatches.length = 0
    this._pipelineCurrentIndex = 0

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

    if (this._pipelineMode) {
      // In pipeline mode, ReadyForQuery marks end of a pipeline batch sync
      // The first batch in _pendingPipelineBatches is now complete
      if (this._pendingPipelineBatches.length > 0) {
        this._pendingPipelineBatches.shift()
      }
      this._pipelineCurrentIndex = 0
      this.readyForQuery = true
      this._pulseQueryQueue()
      return
    }

    const activeQuery = this._getActiveQuery()
    this._activeQuery = null
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

    if (this._pipelineMode && this._pendingPipelineBatches.length > 0) {
      // In pipeline mode, error aborts the current query in the current batch
      // Server will skip remaining commands until Sync
      const batch = this._pendingPipelineBatches[0]
      const query = batch[this._pipelineCurrentIndex]
      if (query) {
        query.handleError(msg, this.connection)
      }
      // Mark remaining pending queries IN THIS BATCH as aborted
      for (let i = this._pipelineCurrentIndex + 1; i < batch.length; i++) {
        const pendingQuery = batch[i]
        const abortError = new Error('Query aborted due to pipeline error')
        abortError.pipelineAborted = true
        abortError.originalError = msg
        pendingQuery.handleError(abortError, this.connection)
      }
      return
    }

    const activeQuery = this._getActiveQuery()

    if (!activeQuery) {
      this._handleErrorEvent(msg)
      return
    }

    this._activeQuery = null
    activeQuery.handleError(msg, this.connection)
  }

  _handleRowDescription(msg) {
    if (this._pipelineMode) {
      const query = this._getCurrentPipelineQuery()
      if (query) {
        query.handleRowDescription(msg)
      }
      return
    }

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
    if (this._pipelineMode) {
      const query = this._getCurrentPipelineQuery()
      if (query) {
        query.handleDataRow(msg)
      }
      return
    }

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
    if (this._pipelineMode) {
      const query = this._getCurrentPipelineQuery()
      if (query) {
        query.handleEmptyQuery(this.connection)
        query.handleReadyForQuery(this.connection)
      }
      this._pipelineCurrentIndex++
      return
    }

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
    if (this._pipelineMode) {
      const query = this._getCurrentPipelineQuery()
      if (query) {
        query.handleCommandComplete(msg, this.connection)
        // In pipeline mode, commandComplete marks query completion
        // Signal readyForQuery to the individual query
        query.handleReadyForQuery(this.connection)
      }
      this._pipelineCurrentIndex++
      return
    }

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
    if (this._pipelineMode) {
      const query = this._getCurrentPipelineQuery()
      if (query && query.name) {
        this.connection.parsedStatements[query.name] = query.text
      }
      return
    }

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
      return this._pulsePipelineQueue()
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

  /**
   * Pipeline mode query queue processing.
   * Sends queries without waiting for individual ReadyForQuery responses.
   */
  /**
   * Pipeline mode query queue processing.
   * Sends queries without waiting for individual ReadyForQuery responses.
   */
  _pulsePipelineQueue() {
    // If no queries to send, check if we need to drain or sync current batch
    if (this._queryQueue.length === 0) {
      if (this._activePipelineBatch.length > 0) {
        // Queue is empty but we have unsynced queries, force a sync
        this._sendPipelineSync()
      } else if (this.hasExecuted && this._pendingPipelineBatches.length === 0) {
        this.emit('drain')
      }
      return
    }

    //Cork the stream to batch all messages
    this.connection.stream.cork && this.connection.stream.cork()

    try {
      // Send queries up to batch size
      while (this._queryQueue.length > 0 && this._activePipelineBatch.length < this._pipelineBatchSize) {
        const query = this._queryQueue.shift()
        this._activePipelineBatch.push(query)

        // Submit query without sync
        const queryError = this._submitPipelineQuery(query)
        if (queryError) {
          // Handle submit error immediately
          this._activePipelineBatch.pop()
          process.nextTick(() => {
            query.handleError(queryError, this.connection)
          })
          continue
        }
      }

      // Check if we should sync
      const isFull = this._activePipelineBatch.length >= this._pipelineBatchSize
      const isEmpty = this._queryQueue.length === 0
      const useTimeout = this._pipelineBatchTimeout > 0

      if (isFull) {
        this._sendPipelineSync()
      } else if (isEmpty && !useTimeout) {
        // Default behavior: sync immediately if empty and no timeout
        this._sendPipelineSync()
      } else if (useTimeout) {
        // Schedule sync (wait for more queries or timeout)
        this._schedulePipelineSync()
      }
    } finally {
      // Uncork to send all buffered data
      this.connection.stream.uncork && this.connection.stream.uncork()
    }
  }

  /**
   * Submit a query in pipeline mode (without sync).
   * Returns an error if submit fails, null otherwise.
   */
  _submitPipelineQuery(query) {
    const connection = this.connection

    this.hasExecuted = true
    this.readyForQuery = false

    if (query.requiresPreparation()) {
      // Extended query protocol
      try {
        if (!query.hasBeenParsed(connection)) {
          connection.parse({
            text: query.text,
            name: query.name,
            types: query.types,
          })
        }

        connection.bind({
          portal: query.portal || '',
          statement: query.name || '',
          values: query.values || [],
          binary: query.binary,
          valueMapper: utils.prepareValue,
        })

        connection.describe({
          type: 'P',
          name: query.portal || '',
        })

        connection.execute({
          portal: query.portal || '',
          rows: query.rows || 0,
        })
      } catch (err) {
        return err
      }
    } else {
      // Simple query (can't be truly pipelined, but we queue it)
      connection.query(query.text)
    }

    return null
  }

  _schedulePipelineSync() {
    if (this._pipelineSyncTimer) return

    this._pipelineSyncTimer = setTimeout(() => {
      this._pipelineSyncTimer = null
      if (this._activePipelineBatch.length > 0) {
        this._sendPipelineSync()
      }
    }, this._pipelineBatchTimeout)
  }

  /**
   * Send a Sync message to mark pipeline boundary
   */
  _sendPipelineSync() {
    if (this._pipelineSyncTimer) {
      clearTimeout(this._pipelineSyncTimer)
      this._pipelineSyncTimer = null
    }

    // Move active batch to pending batches
    if (this._activePipelineBatch.length > 0) {
      this._pendingPipelineBatches.push(this._activePipelineBatch)
      this._activePipelineBatch = []
      this.connection.sync()
    }
  }

  /**
   * Get the current query being processed in pipeline mode
   */
  _getCurrentPipelineQuery() {
    const currentBatch = this._pendingPipelineBatches[0]
    return currentBatch ? currentBatch[this._pipelineCurrentIndex] : null
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

    // Clear pipeline timer
    if (this._pipelineSyncTimer) {
      clearTimeout(this._pipelineSyncTimer)
      this._pipelineSyncTimer = null
    }

    // if we have never connected, then end is a noop, callback immediately
    if (!this.connection._connecting || this._ended) {
      if (cb) {
        cb()
      } else {
        return this._Promise.resolve()
      }
    }

    if (
      this._getActiveQuery() ||
      this._activePipelineBatch.length > 0 ||
      this._pendingPipelineBatches.length > 0 ||
      !this._queryable
    ) {
      // if we have an active query or pipeline queries we need to force a disconnect
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
