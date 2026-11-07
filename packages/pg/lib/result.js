'use strict'

const types = require('pg-types')
const textParsers = require('pg-types/lib/textParsers')

const matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/

// How a text column is read from the row bytes. Only the built-in parsers take a shortcut,
// a parser set with setTypeParser gets the string as always.
const OTHER = 0
const INT = 1
const BOOL = 2
const TEXT = 3

// From the source and not from getTypeParser, which also returns the overrides.
const builtinParsers = new Map()
textParsers.init((oid, parser) => builtinParsers.set(oid, parser))
const noParse = types.getTypeParser(25, 'unknown format')

const kindOf = (oid, parser) => {
  if (parser === noParse) return TEXT
  if (parser !== builtinParsers.get(oid)) return OTHER
  if (oid === 21 || oid === 23 || oid === 26) return INT // int2, int4, oid
  return oid === 16 ? BOOL : OTHER
}

const text =
  typeof Buffer.prototype.utf8Slice === 'function'
    ? (buffer, start, end) => buffer.utf8Slice(start, end)
    : (buffer, start, end) => buffer.toString('utf8', start, end)

// The server writes these as digits with an optional minus, and they always fit a double.
const int = (buffer, start, end) => {
  const negative = buffer[start] === 45
  let value = 0
  for (let i = negative ? start + 1 : start; i < end; i++) {
    value = value * 10 + buffer[i] - 48
  }
  return negative ? -value : value
}

// result object returned from query
// in the 'end' event and also
// passed as second argument to provided callback
class Result {
  constructor(rowMode, types) {
    this.command = null
    this.rowCount = null
    this.oid = null
    this.rows = []
    this.fields = []
    this._parsers = undefined
    this._names = []
    this._kinds = []
    this._hasBinary = false
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
    let match
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
        // COMMAND OID ROWS
        this.oid = parseInt(match[2], 10)
        this.rowCount = parseInt(match[3], 10)
      } else if (match[2]) {
        // COMMAND ROWS
        this.rowCount = parseInt(match[2], 10)
      }
    }
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

  // Same result as parseRow(msg.fields), without a string for every value.
  parseDataRow(msg) {
    const names = this._names
    if (msg.buffer === undefined || this.rowAsArray || this._hasBinary || msg.fieldCount !== names.length) {
      return this.parseRow(msg.fields)
    }
    const buffer = msg.buffer
    const kinds = this._kinds
    const parsers = this._parsers
    const row = { ...this._prebuiltEmptyResultObject }
    let offset = msg.offset
    for (let i = 0, len = names.length; i < len; i++) {
      const size = (buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]
      offset += 4
      if (size === -1) {
        row[names[i]] = null
        continue
      }
      const end = offset + size
      switch (kinds[i]) {
        case INT:
          row[names[i]] = int(buffer, offset, end)
          break
        case BOOL:
          row[names[i]] = buffer[offset] === 116
          break
        case TEXT:
          row[names[i]] = text(buffer, offset, end)
          break
        default:
          row[names[i]] = parsers[i](text(buffer, offset, end))
      }
      offset = end
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

    const row = Object.create(null)

    this._names = new Array(fieldDescriptions.length)
    this._kinds = new Array(fieldDescriptions.length)
    this._hasBinary = false

    for (let i = 0; i < fieldDescriptions.length; i++) {
      const desc = fieldDescriptions[i]
      row[desc.name] = null
      this._names[i] = desc.name
      this._hasBinary ||= desc.format === 'binary'

      if (this._types) {
        this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || 'text')
      } else {
        this._parsers[i] = types.getTypeParser(desc.dataTypeID, desc.format || 'text')
      }
      this._kinds[i] = kindOf(desc.dataTypeID, this._parsers[i])
    }

    this._prebuiltEmptyResultObject = { ...row }
  }
}

module.exports = Result
