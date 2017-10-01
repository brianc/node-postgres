'use strict'
/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var EventEmitter = require('events').EventEmitter
var utils = require('./utils')
var pgPass = require('pgpass')
var TypeOverrides = require('./type-overrides')

var ConnectionParameters = require('./connection-parameters')
var Query = require('./query')
var defaults = require('./defaults')
var Connection = require('./connection')

class Client extends EventEmitter {
  constructor (config) {
    super()

    this.connectionParameters = new ConnectionParameters(config)
    this.user = this.connectionParameters.user
    this.database = this.connectionParameters.database
    this.port = this.connectionParameters.port
    this.host = this.connectionParameters.host
    this.password = this.connectionParameters.password
    this.replication = this.connectionParameters.replication

    var c = config || {}

    this._types = new TypeOverrides(c.types)
    this._ending = false
    this._connecting = false
    this._connected = false
    this._connectionError = false

    this.connection = c.connection || new Connection({
      stream: c.stream,
      ssl: this.connectionParameters.ssl,
      keepAlive: c.keepAlive || false,
      encoding: this.connectionParameters.client_encoding || 'utf8'
    })
    this.queryQueue = []
    this.binary = c.binary || defaults.binary
    this.processID = null
    this.secretKey = null
    this.ssl = this.connectionParameters.ssl || false
  }

  connect (callback) {
    var con = this.connection
    if (this._connecting || this._connected) {
      const err = new Error('Client has already been connected. You cannot reuse a client.')
      if (callback) {
        callback(err)
        return undefined
      }
      return Promise.reject(err)
    }
    this._connecting = true

    if (this.host && this.host.indexOf('/') === 0) {
      con.connect(this.host + '/.s.PGSQL.' + this.port)
    } else {
      con.connect(this.port, this.host)
    }

    // once connection is established send startup message
    con.on('connect', () => {
      if (this.ssl) {
        con.requestSsl()
      } else {
        con.startup(this.getStartupConf())
      }
    })

    con.on('sslconnect', () => {
      con.startup(this.getStartupConf())
    })

    const checkPgPass = (cb) => {
      return (msg) => {
        if (this.password !== null) {
          cb(msg)
        } else {
          pgPass(this.connectionParameters, function (pass) {
            if (undefined !== pass) {
              this.connectionParameters.password = this.password = pass
            }
            cb(msg)
          })
        }
      }
    }

    // password request handling
    con.on('authenticationCleartextPassword', checkPgPass(() => {
      con.password(this.password)
    }))

    // password request handling
    con.on('authenticationMD5Password', checkPgPass((msg) => {
      con.password(utils.postgresMd5PasswordHash(this.user, this.password, msg.salt))
    }))

    con.once('backendKeyData', (msg) => {
      this.processID = msg.processID
      this.secretKey = msg.secretKey
    })

    const connectingErrorHandler = (err) => {
      if (this._connectionError) {
        return
      }
      this._connectionError = true
      if (callback) {
        return callback(err)
      }
      this.emit('error', err)
    }

    const connectedErrorHandler = (err) => {
      if (this.activeQuery) {
        var activeQuery = this.activeQuery
        this.activeQuery = null
        return activeQuery.handleError(err, con)
      }
      this.emit('error', err)
    }

    con.on('error', connectingErrorHandler)

    // hook up query handling events to connection
    // after the connection initially becomes ready for queries
    con.once('readyForQuery', () => {
      this._connecting = false
      this._connected = true
      this._attachListeners(con)
      con.removeListener('error', connectingErrorHandler)
      con.on('error', connectedErrorHandler)

      // process possible callback argument to Client#connect
      if (callback) {
        callback(null, this)
        // remove callback for proper error handling
        // after the connect event
        callback = null
      }
      this.emit('connect')
    })

    con.on('readyForQuery', () => {
      var activeQuery = this.activeQuery
      this.activeQuery = null
      this.readyForQuery = true
      if (activeQuery) {
        activeQuery.handleReadyForQuery(con)
      }
      this._pulseQueryQueue()
    })

    con.once('end', () => {
      if (this.activeQuery) {
        var disconnectError = new Error('Connection terminated')
        this.activeQuery.handleError(disconnectError, con)
        this.activeQuery = null
      }
      if (!this._ending) {
        // if the connection is ended without us calling .end()
        // on this client then we have an unexpected disconnection
        // treat this as an error unless we've already emitted an error
        // during connection.
        const error = new Error('Connection terminated unexpectedly')
        if (this._connecting && !this._connectionError) {
          if (callback) {
            callback(error)
          } else {
            this.emit('error', error)
          }
        } else if (!this._connectionError) {
          this.emit('error', error)
        }
      }
      this.emit('end')
    })

    con.on('notice', (msg) => {
      this.emit('notice', msg)
    })

    if (!callback) {
      return new global.Promise((resolve, reject) => {
        this.once('error', reject)
        this.once('connect', () => {
          this.removeListener('error', reject)
          resolve()
        })
      })
    }
  }

  _attachListeners (con) {
    // delegate rowDescription to active query
    con.on('rowDescription', (msg) => {
      this.activeQuery.handleRowDescription(msg)
    })

    // delegate dataRow to active query
    con.on('dataRow', (msg) => {
      this.activeQuery.handleDataRow(msg)
    })

    // delegate portalSuspended to active query
    con.on('portalSuspended', (msg) => {
      this.activeQuery.handlePortalSuspended(con)
    })

    // deletagate emptyQuery to active query
    con.on('emptyQuery', (msg) => {
      this.activeQuery.handleEmptyQuery(con)
    })

    // delegate commandComplete to active query
    con.on('commandComplete', (msg) => {
      this.activeQuery.handleCommandComplete(msg, con)
    })

    // if a prepared statement has a name and properly parses
    // we track that its already been executed so we don't parse
    // it again on the same client
    con.on('parseComplete', (msg) => {
      if (this.activeQuery.name) {
        con.parsedStatements[this.activeQuery.name] = true
      }
    })

    con.on('copyInResponse', (msg) => {
      this.activeQuery.handleCopyInResponse(this.connection)
    })

    con.on('copyData', (msg) => {
      this.activeQuery.handleCopyData(msg, this.connection)
    })

    con.on('notification', (msg) => {
      this.emit('notification', msg)
    })
  }

  getStartupConf () {
    var params = this.connectionParameters

    var data = {
      user: params.user,
      database: params.database
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

    return data
  }

  cancel (client, query) {
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

  setTypeParser (oid, format, parseFn) {
    return this._types.setTypeParser(oid, format, parseFn)
  }

  getTypeParser (oid, format) {
    return this._types.getTypeParser(oid, format)
  }

  // Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
  escapeIdentifier (str) {
    var escaped = '"'

    for (var i = 0; i < str.length; i++) {
      var c = str[i]
      if (c === '"') {
        escaped += c + c
      } else {
        escaped += c
      }
    }

    escaped += '"'

    return escaped
  }

  // Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
  escapeLiteral (str) {
    var hasBackslash = false
    var escaped = '\''

    for (var i = 0; i < str.length; i++) {
      var c = str[i]
      if (c === '\'') {
        escaped += c + c
      } else if (c === '\\') {
        escaped += c + c
        hasBackslash = true
      } else {
        escaped += c
      }
    }

    escaped += '\''

    if (hasBackslash === true) {
      escaped = ' E' + escaped
    }

    return escaped
  }

  _pulseQueryQueue () {
    if (this.readyForQuery === true) {
      this.activeQuery = this.queryQueue.shift()
      if (this.activeQuery) {
        this.readyForQuery = false
        this.hasExecuted = true
        this.activeQuery.submit(this.connection)
      } else if (this.hasExecuted) {
        this.activeQuery = null
        this.emit('drain')
      }
    }
  }

  query (config, values, callback) {
    // can take in strings, config object or query object
    var query
    var result
    if (typeof config.submit === 'function') {
      result = query = config
      if (typeof values === 'function') {
        query.callback = query.callback || values
      }
    } else {
      query = new Query(config, values, callback)
      if (!query.callback) {
        let resolveOut, rejectOut
        result = new Promise((resolve, reject) => {
          resolveOut = resolve
          rejectOut = reject
        })
        query.callback = (err, res) => err ? rejectOut(err) : resolveOut(res)
      }
    }

    if (this.binary && !query.binary) {
      query.binary = true
    }
    if (query._result) {
      query._result._getTypeParser = this._types.getTypeParser.bind(this._types)
    }

    this.queryQueue.push(query)
    this._pulseQueryQueue()
    return result
  }

  end (cb) {
    this._ending = true
    if (this.activeQuery) {
      // if we have an active query we need to force a disconnect
      // on the socket - otherwise a hung query could block end forever
      this.connection.stream.destroy(new Error('Connection terminated by user'))
      return cb ? cb() : Promise.resolve()
    }
    if (cb) {
      this.connection.end()
      this.connection.once('end', cb)
    } else {
      return new global.Promise((resolve, reject) => {
        this.connection.end()
        this.connection.once('end', resolve)
      })
    }
  }
}

// expose a Query constructor
Client.Query = Query

module.exports = Client
