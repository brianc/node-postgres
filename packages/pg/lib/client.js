'use strict'
/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var EventEmitter = require('events').EventEmitter
var util = require('util')
var utils = require('./utils')
var sasl = require('./sasl')
var pgPass = require('pgpass')
var TypeOverrides = require('./type-overrides')

var ConnectionParameters = require('./connection-parameters')
var Query = require('./query')
var defaults = require('./defaults')
var Connection = require('./connection')

var Client = function (config) {
  EventEmitter.call(this)

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

  var c = config || {}

  this._Promise = c.Promise || global.Promise
  this._types = new TypeOverrides(c.types)
  this._ending = false
  this._connecting = false
  this._connected = false
  this._connectionError = false
  this._queryable = true

  this.connection =
    c.connection ||
    new Connection({
      stream: c.stream,
      ssl: this.connectionParameters.ssl,
      keepAlive: c.keepAlive || false,
      keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
      encoding: this.connectionParameters.client_encoding || 'utf8',
    })
  this.queryQueue = []
  this.binary = c.binary || defaults.binary
  this.processID = null
  this.secretKey = null
  this.ssl = this.connectionParameters.ssl || false
  this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0
}

util.inherits(Client, EventEmitter)

Client.prototype._errorAllQueries = function (err) {
  const enqueueError = (query) => {
    process.nextTick(() => {
      query.handleError(err, this.connection)
    })
  }

  if (this.activeQuery) {
    enqueueError(this.activeQuery)
    this.activeQuery = null
  }

  this.queryQueue.forEach(enqueueError)
  this.queryQueue.length = 0
}

Client.prototype._connect = function (callback) {
  var self = this
  var con = this.connection
  if (this._connecting || this._connected) {
    const err = new Error('Client has already been connected. You cannot reuse a client.')
    process.nextTick(() => {
      callback(err)
    })
    return
  }
  this._connecting = true

  var connectionTimeoutHandle
  if (this._connectionTimeoutMillis > 0) {
    connectionTimeoutHandle = setTimeout(() => {
      con._ending = true
      con.stream.destroy(new Error('timeout expired'))
    }, this._connectionTimeoutMillis)
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

  function checkPgPass(cb) {
    return function (msg) {
      if (typeof self.password === 'function') {
        self._Promise
          .resolve()
          .then(() => self.password())
          .then((pass) => {
            if (pass !== undefined) {
              if (typeof pass !== 'string') {
                con.emit('error', new TypeError('Password must be a string'))
                return
              }
              self.connectionParameters.password = self.password = pass
            } else {
              self.connectionParameters.password = self.password = null
            }
            cb(msg)
          })
          .catch((err) => {
            con.emit('error', err)
          })
      } else if (self.password !== null) {
        cb(msg)
      } else {
        pgPass(self.connectionParameters, function (pass) {
          if (undefined !== pass) {
            self.connectionParameters.password = self.password = pass
          }
          cb(msg)
        })
      }
    }
  }

  // password request handling
  con.on(
    'authenticationCleartextPassword',
    checkPgPass(function () {
      con.password(self.password)
    })
  )

  // password request handling
  con.on(
    'authenticationMD5Password',
    checkPgPass(function (msg) {
      con.password(utils.postgresMd5PasswordHash(self.user, self.password, msg.salt))
    })
  )

  // password request handling (SASL)
  var saslSession
  con.on(
    'authenticationSASL',
    checkPgPass(function (msg) {
      saslSession = sasl.startSession(msg.mechanisms)

      con.sendSASLInitialResponseMessage(saslSession.mechanism, saslSession.response)
    })
  )

  // password request handling (SASL)
  con.on('authenticationSASLContinue', function (msg) {
    sasl.continueSession(saslSession, self.password, msg.data)

    con.sendSCRAMClientFinalMessage(saslSession.response)
  })

  // password request handling (SASL)
  con.on('authenticationSASLFinal', function (msg) {
    sasl.finalizeSession(saslSession, msg.data)

    saslSession = null
  })

  con.once('backendKeyData', function (msg) {
    self.processID = msg.processID
    self.secretKey = msg.secretKey
  })

  const connectingErrorHandler = (err) => {
    if (this._connectionError) {
      return
    }
    this._connectionError = true
    clearTimeout(connectionTimeoutHandle)
    if (callback) {
      return callback(err)
    }
    this.emit('error', err)
  }

  const connectedErrorHandler = (err) => {
    this._queryable = false
    this._errorAllQueries(err)
    this.emit('error', err)
  }

  const connectedErrorMessageHandler = (msg) => {
    const activeQuery = this.activeQuery

    if (!activeQuery) {
      connectedErrorHandler(msg)
      return
    }

    this.activeQuery = null
    activeQuery.handleError(msg, con)
  }

  con.on('error', connectingErrorHandler)
  con.on('errorMessage', connectingErrorHandler)

  // hook up query handling events to connection
  // after the connection initially becomes ready for queries
  con.once('readyForQuery', function () {
    self._connecting = false
    self._connected = true
    self._attachListeners(con)
    con.removeListener('error', connectingErrorHandler)
    con.removeListener('errorMessage', connectingErrorHandler)
    con.on('error', connectedErrorHandler)
    con.on('errorMessage', connectedErrorMessageHandler)
    clearTimeout(connectionTimeoutHandle)

    // process possible callback argument to Client#connect
    if (callback) {
      callback(null, self)
      // remove callback for proper error handling
      // after the connect event
      callback = null
    }
    self.emit('connect')
  })

  con.on('readyForQuery', function () {
    var activeQuery = self.activeQuery
    self.activeQuery = null
    self.readyForQuery = true
    if (activeQuery) {
      activeQuery.handleReadyForQuery(con)
    }
    self._pulseQueryQueue()
  })

  con.once('end', () => {
    const error = this._ending ? new Error('Connection terminated') : new Error('Connection terminated unexpectedly')

    clearTimeout(connectionTimeoutHandle)
    this._errorAllQueries(error)

    if (!this._ending) {
      // if the connection is ended without us calling .end()
      // on this client then we have an unexpected disconnection
      // treat this as an error unless we've already emitted an error
      // during connection.
      if (this._connecting && !this._connectionError) {
        if (callback) {
          callback(error)
        } else {
          connectedErrorHandler(error)
        }
      } else if (!this._connectionError) {
        connectedErrorHandler(error)
      }
    }

    process.nextTick(() => {
      this.emit('end')
    })
  })

  con.on('notice', function (msg) {
    self.emit('notice', msg)
  })
}

Client.prototype.connect = function (callback) {
  if (callback) {
    this._connect(callback)
    return
  }

  return new this._Promise((resolve, reject) => {
    this._connect((error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

Client.prototype._attachListeners = function (con) {
  const self = this
  // delegate rowDescription to active query
  con.on('rowDescription', function (msg) {
    self.activeQuery.handleRowDescription(msg)
  })

  // delegate dataRow to active query
  con.on('dataRow', function (msg) {
    self.activeQuery.handleDataRow(msg)
  })

  // delegate portalSuspended to active query
  // eslint-disable-next-line no-unused-vars
  con.on('portalSuspended', function (msg) {
    self.activeQuery.handlePortalSuspended(con)
  })

  // delegate emptyQuery to active query
  // eslint-disable-next-line no-unused-vars
  con.on('emptyQuery', function (msg) {
    self.activeQuery.handleEmptyQuery(con)
  })

  // delegate commandComplete to active query
  con.on('commandComplete', function (msg) {
    self.activeQuery.handleCommandComplete(msg, con)
  })

  // if a prepared statement has a name and properly parses
  // we track that its already been executed so we don't parse
  // it again on the same client
  // eslint-disable-next-line no-unused-vars
  con.on('parseComplete', function (msg) {
    if (self.activeQuery.name) {
      con.parsedStatements[self.activeQuery.name] = self.activeQuery.text
    }
  })

  // eslint-disable-next-line no-unused-vars
  con.on('copyInResponse', function (msg) {
    self.activeQuery.handleCopyInResponse(self.connection)
  })

  con.on('copyData', function (msg) {
    self.activeQuery.handleCopyData(msg, self.connection)
  })

  con.on('notification', function (msg) {
    self.emit('notification', msg)
  })
}

Client.prototype.getStartupConf = function () {
  var params = this.connectionParameters

  var data = {
    user: params.user,
    database: params.database,
  }

  var appName = params.application_name || params.fallback_application_name
  if (appName) {
    data.application_name = appName
  }
  if (params.replication) {
    data.replication = '' + params.replication
  }
  if (params.statement_timeout) {
    data.statement_timeout = String(parseInt(params.statement_timeout, 10))
  }
  if (params.idle_in_transaction_session_timeout) {
    data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10))
  }
  if (params.options) {
    data.options = params.options
  }

  return data
}

Client.prototype.cancel = function (client, query) {
  if (client.activeQuery === query) {
    var con = this.connection

    if (this.host && this.host.indexOf('/') === 0) {
      con.connect(this.host + '/.s.PGSQL.' + this.port)
    } else {
      con.connect(this.port, this.host)
    }

    // once connection is established send cancel message
    con.on('connect', function () {
      con.cancel(client.processID, client.secretKey)
    })
  } else if (client.queryQueue.indexOf(query) !== -1) {
    client.queryQueue.splice(client.queryQueue.indexOf(query), 1)
  }
}

Client.prototype.setTypeParser = function (oid, format, parseFn) {
  return this._types.setTypeParser(oid, format, parseFn)
}

Client.prototype.getTypeParser = function (oid, format) {
  return this._types.getTypeParser(oid, format)
}

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
Client.prototype.escapeIdentifier = function (str) {
  return '"' + str.replace(/"/g, '""') + '"'
}

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
Client.prototype.escapeLiteral = function (str) {
  var hasBackslash = false
  var escaped = "'"

  for (var i = 0; i < str.length; i++) {
    var c = str[i]
    if (c === "'") {
      escaped += c + c
    } else if (c === '\\') {
      escaped += c + c
      hasBackslash = true
    } else {
      escaped += c
    }
  }

  escaped += "'"

  if (hasBackslash === true) {
    escaped = ' E' + escaped
  }

  return escaped
}

Client.prototype._pulseQueryQueue = function () {
  if (this.readyForQuery === true) {
    this.activeQuery = this.queryQueue.shift()
    if (this.activeQuery) {
      this.readyForQuery = false
      this.hasExecuted = true

      const queryError = this.activeQuery.submit(this.connection)
      if (queryError) {
        process.nextTick(() => {
          this.activeQuery.handleError(queryError, this.connection)
          this.readyForQuery = true
          this._pulseQueryQueue()
        })
      }
    } else if (this.hasExecuted) {
      this.activeQuery = null
      this.emit('drain')
    }
  }
}

Client.prototype.query = function (config, values, callback) {
  // can take in strings, config object or query object
  var query
  var result
  var readTimeout
  var readTimeoutTimer
  var queryCallback

  if (config === null || config === undefined) {
    throw new TypeError('Client was passed a null or undefined query')
  } else if (typeof config.submit === 'function') {
    readTimeout = config.query_timeout || this.connectionParameters.query_timeout
    result = query = config
    if (typeof values === 'function') {
      query.callback = query.callback || values
    }
  } else {
    readTimeout = this.connectionParameters.query_timeout
    query = new Query(config, values, callback)
    if (!query.callback) {
      result = new this._Promise((resolve, reject) => {
        query.callback = (err, res) => (err ? reject(err) : resolve(res))
      })
    }
  }

  if (readTimeout) {
    queryCallback = query.callback

    readTimeoutTimer = setTimeout(() => {
      var error = new Error('Query read timeout')

      process.nextTick(() => {
        query.handleError(error, this.connection)
      })

      queryCallback(error)

      // we already returned an error,
      // just do nothing if query completes
      query.callback = () => {}

      // Remove from queue
      var index = this.queryQueue.indexOf(query)
      if (index > -1) {
        this.queryQueue.splice(index, 1)
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

  this.queryQueue.push(query)
  this._pulseQueryQueue()
  return result
}

Client.prototype.end = function (cb) {
  this._ending = true

  // if we have never connected, then end is a noop, callback immediately
  if (!this.connection._connecting) {
    if (cb) {
      cb()
    } else {
      return this._Promise.resolve()
    }
  }

  if (this.activeQuery || !this._queryable) {
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

// expose a Query constructor
Client.Query = Query

module.exports = Client
