'use strict'

const types = require('pg-types')

const matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/

// result object returned from query
// in the 'end' event and also
// passed as second argument to provided callback
class Result {
  constructor(rowMode, types) {
    this._command = undefined
    this._rowCount = undefined
    this._oid = undefined
    this._commandCompleteMsg = undefined
    this.rows = []
    this.fields = []
    this._parsers = undefined
    this._types = types
    this.RowCtor = null
    this.rowAsArray = rowMode === 'array'
    if (this.rowAsArray) {
      this.parseRow = this._parseRowAsArray
    }
    this._prebuiltEmptyResultObject = null
  }

  // adds a command complete message
  addCommandComplete(msg) {
    this._commandCompleteMsg = msg
    this._command = undefined
    this._rowCount = undefined
    this._oid = undefined
  }

  _parseRowAsArray(rowData) {
    const row = new Array(rowData.length)
    for (let i = 0, len = rowData.length; i < len; i++) {
      const rawValue = rowData[i]
      if (rawValue !== null) {
        row[i] = this._parsers[i](rawValue)
      } else {
        row[i] = null
      }
    }
    return row
  }

  parseRow(rowData) {
    const row = { ...this._prebuiltEmptyResultObject }
    for (let i = 0, len = rowData.length; i < len; i++) {
      const rawValue = rowData[i]
      const field = this.fields[i].name
      if (rawValue !== null) {
        const v = this.fields[i].format === 'binary' ? Buffer.from(rawValue) : rawValue
        row[field] = this._parsers[i](v)
      } else {
        row[field] = null
      }
    }
    return row
  }

  addRow(row) {
    this.rows.push(row)
  }

  addFields(fieldDescriptions) {
    // clears field definitions
    // multiple query statements in 1 action can result in multiple sets
    // of rowDescriptions...eg: 'select NOW(); select 1::int;'
    // you need to reset the fields
    this.fields = fieldDescriptions
    if (this.fields.length) {
      this._parsers = new Array(fieldDescriptions.length)
    }

    const row = {}

    for (let i = 0; i < fieldDescriptions.length; i++) {
      const desc = fieldDescriptions[i]
      row[desc.name] = null

      if (this._types) {
        this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || 'text')
      } else {
        this._parsers[i] = types.getTypeParser(desc.dataTypeID, desc.format || 'text')
      }
    }

    this._prebuiltEmptyResultObject = { ...row }
  }
  get command() {
    this._parseCommandCompleteIfNeeded()
    return this._command
  }

  get rowCount() {
    this._parseCommandCompleteIfNeeded()
    return this._rowCount
  }

  get oid() {
    this._parseCommandCompleteIfNeeded()
    return this._oid
  }

  _parseCommandCompleteIfNeeded() {
    if (this._command !== undefined || !this._commandCompleteMsg) {
      return
    }
    let match
    const msg = this._commandCompleteMsg
    if (msg.text) {
      match = matchRegexp.exec(msg.text)
    } else {
      match = matchRegexp.exec(msg.command)
    }
    if (match) {
      this._command = match[1]
      if (match[3]) {
        // COMMAND OID ROWS
        this._oid = parseInt(match[2], 10)
        this._rowCount = parseInt(match[3], 10)
      } else if (match[2]) {
        // COMMAND ROWS
        this._oid = null
        this._rowCount = parseInt(match[2], 10)
      } else {
        this._oid = null
        this._rowCount = null
      }
    } else {
      this._command = null
      this._oid = null
      this._rowCount = null
    }
  }
}

module.exports = Result
