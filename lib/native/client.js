'use strict'
/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var Native = require('pg-native')
var TypeOverrides = require('../type-overrides')
var semver = require('semver')
var pkg = require('../../package.json')
var assert = require('assert')
var EventEmitter = require('events').EventEmitter
var ConnectionParameters = require('../connection-parameters')

var msg = 'Version >= ' + pkg.minNativeVersion + ' of pg-native required.'
assert(semver.gte(Native.version, pkg.minNativeVersion), msg)

var NativeQuery = require('./query')

class Client extends EventEmitter {
  constructor (config) {
    super()

    config = config || {}

    this._types = new TypeOverrides(config.types)

    this.native = new Native({
      types: this._types
    })

    this._queryQueue = []
    this._connected = false
    this._connecting = false

    // keep these on the object for legacy reasons
    // for the time being. TODO: deprecate all this jazz
    var cp = this.connectionParameters = new ConnectionParameters(config)
    this.user = cp.user
    this.password = cp.password
    this.database = cp.database
    this.host = cp.host
    this.port = cp.port

    // a hash to hold named queries
    this.namedQueries = {}
  }

  // connect to the backend
  // pass an optional callback to be called once connected
  // or with an error if there was a connection error
  // if no callback is passed and there is a connection error
  // the client will emit an error event.
  connect (cb) {
    var onError = (err) => {
      if (cb) return cb(err)
      return this.emit('error', err)
    }

    var result
    if (!cb) {
      var resolveOut, rejectOut
      cb = (err) => err ? rejectOut(err) : resolveOut()
      result = new global.Promise(function (resolve, reject) {
        resolveOut = resolve
        rejectOut = reject
      })
    }

    if (this._connecting) {
      process.nextTick(() => cb(new Error('Client has already been connected. You cannot reuse a client.')))
      return result
    }

    this._connecting = true

    this.connectionParameters.getLibpqConnectionString((err, conString) => {
      if (err) return onError(err)
      this.native.connect(conString, (err) => {
        if (err) return onError(err)

        // set internal states to connected
        this._connected = true

        // handle connection errors from the native layer
        this.native.on('error', (err) => {
          // error will be handled by active query
          if (this._activeQuery && this._activeQuery.state !== 'end') {
            return
          }
          this.emit('error', err)
        })

        this.native.on('notification', (msg) => {
          this.emit('notification', {
            channel: msg.relname,
            payload: msg.extra
          })
        })

        // signal we are connected now
        this.emit('connect')
        this._pulseQueryQueue(true)

        // possibly call the optional callback
        if (cb) cb()
      })
    })

    return result
  }

  // send a query to the server
  // this method is highly overloaded to take
  // 1) string query, optional array of parameters, optional function callback
  // 2) object query with {
  //    string query
  //    optional array values,
  //    optional function callback instead of as a separate parameter
  //    optional string name to name & cache the query plan
  //    optional string rowMode = 'array' for an array of results
  //  }
  query (config, values, callback) {
    if (typeof config.submit === 'function') {
      // accept query(new Query(...), (err, res) => { }) style
      if (typeof values === 'function') {
        config.callback = values
      }
      this._queryQueue.push(config)
      this._pulseQueryQueue()
      return config
    }

    var query = new NativeQuery(config, values, callback)
    var result
    if (!query.callback) {
      let resolveOut, rejectOut
      result = new Promise((resolve, reject) => {
        resolveOut = resolve
        rejectOut = reject
      })
      query.callback = (err, res) => err ? rejectOut(err) : resolveOut(res)
    }
    this._queryQueue.push(query)
    this._pulseQueryQueue()
    return result
  }

  // disconnect from the backend server
  end (cb) {
    if (!this._connected) {
      this.once('connect', this.end.bind(this, cb))
    }
    var result
    if (!cb) {
      var resolve, reject
      cb = (err) => err ? reject(err) : resolve()
      result = new global.Promise(function (res, rej) {
        resolve = res
        reject = rej
      })
    }
    this.native.end(() => {
      // send an error to the active query
      if (this._hasActiveQuery()) {
        var msg = 'Connection terminated'
        this._queryQueue.length = 0
        this._activeQuery.handleError(new Error(msg))
      }
      this.emit('end')
      if (cb) cb()
    })
    return result
  }

  _hasActiveQuery () {
    return this._activeQuery && this._activeQuery.state !== 'error' && this._activeQuery.state !== 'end'
  }

  _pulseQueryQueue (initialConnection) {
    if (!this._connected) {
      return
    }
    if (this._hasActiveQuery()) {
      return
    }
    var query = this._queryQueue.shift()
    if (!query) {
      if (!initialConnection) {
        this.emit('drain')
      }
      return
    }
    this._activeQuery = query
    query.submit(this)
    query.once('_done', () => {
      this._pulseQueryQueue()
    })
  }

  // attempt to cancel an in-progress query
  cancel (query) {
    if (this._activeQuery === query) {
      this.native.cancel(function () {})
    } else if (this._queryQueue.indexOf(query) !== -1) {
      this._queryQueue.splice(this._queryQueue.indexOf(query), 1)
    }
  }

  setTypeParser (oid, format, parseFn) {
    return this._types.setTypeParser(oid, format, parseFn)
  }

  getTypeParser (oid, format) {
    return this._types.getTypeParser(oid, format)
  }
}

Client.Query = NativeQuery

module.exports = Client
