'use strict'
/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var types = require('pg-types')

// result object returned from query
// in the 'end' event and also
// passed as second argument to provided callback
var Result = function (rowMode, types) {
  this.command = null
  this.rowCount = null
  this.oid = null
  this.rows = []
  this.fields = []
  this._parsers = undefined
  this._types = types
  this.RowCtor = null
  this.rowAsArray = rowMode === 'array'
  if (this.rowAsArray) {
    this.parseRow = this._parseRowAsArray
  }
}

var matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/

// adds a command complete message
Result.prototype.addCommandComplete = function (msg) {
  var match
  if (msg.text) {
    // pure javascript
    match = matchRegexp.exec(msg.text)
  } else {
    // native bindings
    match = matchRegexp.exec(msg.command)
  }
  if (match) {
    this.command = match[1]
    if (match[3]) {
      // COMMMAND OID ROWS
      this.oid = parseInt(match[2], 10)
      this.rowCount = parseInt(match[3], 10)
    } else if (match[2]) {
      // COMMAND ROWS
      this.rowCount = parseInt(match[2], 10)
    }
  }
}

Result.prototype._parseRowAsArray = function (rowData) {
  var row = new Array(rowData.length)
  for (var i = 0, len = rowData.length; i < len; i++) {
    var rawValue = rowData[i]
    if (rawValue !== null) {
      row[i] = this._parsers[i](rawValue)
    } else {
      row[i] = null
    }
  }
  return row
}

Result.prototype.parseRow = function (rowData) {
  var row = {}
  for (var i = 0, len = rowData.length; i < len; i++) {
    var rawValue = rowData[i]
    var field = this.fields[i].name
    if (rawValue !== null) {
      row[field] = this._parsers[i](rawValue)
    } else {
      row[field] = null
    }
  }
  return row
}

Result.prototype.addRow = function (row) {
  this.rows.push(row)
}

Result.prototype.addFields = function (fieldDescriptions) {
  // clears field definitions
  // multiple query statements in 1 action can result in multiple sets
  // of rowDescriptions...eg: 'select NOW(); select 1::int;'
  // you need to reset the fields
  this.fields = fieldDescriptions
  if (this.fields.length) {
    this._parsers = new Array(fieldDescriptions.length)
  }
  for (var i = 0; i < fieldDescriptions.length; i++) {
    var desc = fieldDescriptions[i]
    if (this._types) {
      this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || 'text')
    } else {
      this._parsers[i] = types.getTypeParser(desc.dataTypeID, desc.format || 'text')
    }
  }
}

module.exports = Result
