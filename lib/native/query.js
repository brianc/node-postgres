'use strict'
/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var EventEmitter = require('events').EventEmitter
var utils = require('../utils')

var errorFieldMap = {
  'sqlState': 'code',
  'statementPosition': 'position',
  'messagePrimary': 'message',
  'context': 'where',
  'schemaName': 'schema',
  'tableName': 'table',
  'columnName': 'column',
  'dataTypeName': 'dataType',
  'constraintName': 'constraint',
  'sourceFile': 'file',
  'sourceLine': 'line',
  'sourceFunction': 'routine'
}

class NativeQuery extends EventEmitter {
  constructor (config, values, callback) {
    super()

    config = utils.normalizeQueryConfig(config, values, callback)
    this.text = config.text
    this.values = config.values
    this.name = config.name
    this.callback = config.callback
    this.state = 'new'
    this._arrayMode = config.rowMode === 'array'

    // if the 'row' event is listened for
    // then emit them as they come in
    // without setting singleRowMode to true
    // this has almost no meaning because libpq
    // reads all rows into memory befor returning any
    this._emitRowEvents = false
    this.on('newListener', function (event) {
      if (event === 'row') this._emitRowEvents = true
    }.bind(this))
  }

  handleError (err) {
    // copy pq error fields into the error object
    var fields = this.native.pq.resultErrorFields()
    if (fields) {
      for (var key in fields) {
        var normalizedFieldName = errorFieldMap[key] || key
        err[normalizedFieldName] = fields[key]
      }
    }
    if (this.callback) {
      this.callback(err)
    } else {
      this.emit('error', err)
    }
    this.state = 'error'
  }

  then (onSuccess, onFailure) {
    return this._getPromise().then(onSuccess, onFailure)
  }

  catch (callback) {
    return this._getPromise().catch(callback)
  }

  _getPromise () {
    if (this._promise) return this._promise
    this._promise = new Promise(function (resolve, reject) {
      this._once('end', resolve)
      this._once('error', reject)
    }.bind(this))
    return this._promise
  }

  submit (client) {
    this.state = 'running'
    this.native = client.native
    client.native.arrayMode = this._arrayMode

    var after = (err, rows, results) => {
      client.native.arrayMode = false
      setImmediate(() => {
        this.emit('_done')
      })

      // handle possible query error
      if (err) {
        return this.handleError(err)
      }

      // emit row events for each row in the result
      if (this._emitRowEvents) {
        if (results.length > 1) {
          rows.forEach((rowOfRows, i) => {
            rowOfRows.forEach(row => {
              this.emit('row', row, results[i])
            })
          })
        } else {
          rows.forEach((row) => {
            this.emit('row', row, results)
          })
        }
      }

      // handle successful result
      this.state = 'end'
      this.emit('end', results)
      if (this.callback) {
        this.callback(null, results)
      }
    }

    if (process.domain) {
      after = process.domain.bind(after)
    }

    // named query
    if (this.name) {
      if (this.name.length > 63) {
        console.error('Warning! Postgres only supports 63 characters for query names.')
        console.error('You supplied', this.name, '(', this.name.length, ')')
        console.error('This can cause conflicts and silent errors executing queries')
      }
      var values = (this.values || []).map(utils.prepareValue)

      // check if the client has already executed this named query
      // if so...just execute it again - skip the planning phase
      if (client.namedQueries[this.name]) {
        return client.native.execute(this.name, values, after)
      }
      // plan the named query the first time, then execute it
      return client.native.prepare(this.name, this.text, values.length, (err) => {
        if (err) return after(err)
        client.namedQueries[this.name] = true
        return this.native.execute(this.name, values, after)
      })
    } else if (this.values) {
      if (!Array.isArray(this.values)) {
        const err = new Error('Query values must be an array')
        return after(err)
      }
      var vals = this.values.map(utils.prepareValue)
      client.native.query(this.text, vals, after)
    } else {
      client.native.query(this.text, after)
    }
  }
}

module.exports = NativeQuery
