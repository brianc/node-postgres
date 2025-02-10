'use strict'

const defaults = require('./defaults')

function escapeElement(elementRepresentation) {
  var escaped = elementRepresentation.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  return '"' + escaped + '"'
}

// convert a JS array to a postgres array literal
// uses comma separator so won't work for types like box that use
// a different array separator.
function arrayString(val) {
  var result = '{'
  for (var i = 0; i < val.length; i++) {
    if (i > 0) {
      result = result + ','
    }
    if (val[i] === null || typeof val[i] === 'undefined') {
      result = result + 'NULL'
    } else if (Array.isArray(val[i])) {
      result = result + arrayString(val[i])
    } else if (ArrayBuffer.isView(val[i])) {
      var item = val[i]
      if (!(item instanceof Buffer)) {
        var buf = Buffer.from(item.buffer, item.byteOffset, item.byteLength)
        if (buf.length === item.byteLength) {
          item = buf
        } else {
          item = buf.slice(item.byteOffset, item.byteOffset + item.byteLength)
        }
      }
      result += '\\\\x' + item.toString('hex')
    } else {
      result += escapeElement(prepareValue(val[i]))
    }
  }
  result = result + '}'
  return result
}

// converts values from javascript types
// to their 'raw' counterparts for use as a postgres parameter
// note: you can override this function to provide your own conversion mechanism
// for complex types, etc...
var prepareValue = function (val, seen) {
  // null and undefined are both null for postgres
  if (val == null) {
    return null
  }
  if (typeof val === 'object') {
    if (val instanceof Buffer) {
      return val
    }
    if (ArrayBuffer.isView(val)) {
      var buf = Buffer.from(val.buffer, val.byteOffset, val.byteLength)
      if (buf.length === val.byteLength) {
        return buf
      }
      return buf.slice(val.byteOffset, val.byteOffset + val.byteLength) // Node.js v4 does not support those Buffer.from params
    }
    if (val instanceof Date) {
      if (defaults.parseInputDatesAsUTC) {
        return dateToStringUTC(val)
      } else {
        return dateToString(val)
      }
    }
    if (Array.isArray(val)) {
      return arrayString(val)
    }

    return prepareObject(val, seen)
  }
  return val.toString()
}

function prepareObject(val, seen) {
  if (val && typeof val.toPostgres === 'function') {
    seen = seen || []
    if (seen.indexOf(val) !== -1) {
      throw new Error('circular reference detected while preparing "' + val + '" for query')
    }
    seen.push(val)

    return prepareValue(val.toPostgres(prepareValue), seen)
  }
  return JSON.stringify(val)
}

function dateToString(date) {
  var offset = -date.getTimezoneOffset()

  var year = date.getFullYear()
  var isBCYear = year < 1
  if (isBCYear) year = Math.abs(year) + 1 // negative years are 1 off their BC representation

  var ret =
    String(year).padStart(4, '0') +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0') +
    'T' +
    String(date.getHours()).padStart(2, '0') +
    ':' +
    String(date.getMinutes()).padStart(2, '0') +
    ':' +
    String(date.getSeconds()).padStart(2, '0') +
    '.' +
    String(date.getMilliseconds()).padStart(3, '0')

  if (offset < 0) {
    ret += '-'
    offset *= -1
  } else {
    ret += '+'
  }

  ret += String(Math.floor(offset / 60)).padStart(2, '0') + ':' + String(offset % 60).padStart(2, '0')
  if (isBCYear) ret += ' BC'
  return ret
}

function dateToStringUTC(date) {
  var year = date.getUTCFullYear()
  var isBCYear = year < 1
  if (isBCYear) year = Math.abs(year) + 1 // negative years are 1 off their BC representation

  var ret =
    String(year).padStart(4, '0') +
    '-' +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getUTCDate()).padStart(2, '0') +
    'T' +
    String(date.getUTCHours()).padStart(2, '0') +
    ':' +
    String(date.getUTCMinutes()).padStart(2, '0') +
    ':' +
    String(date.getUTCSeconds()).padStart(2, '0') +
    '.' +
    String(date.getUTCMilliseconds()).padStart(3, '0')

  ret += '+00:00'
  if (isBCYear) ret += ' BC'
  return ret
}

function normalizeQueryConfig(config, values, callback) {
  // can take in strings or config objects
  config = typeof config === 'string' ? { text: config } : config
  if (values) {
    if (typeof values === 'function') {
      config.callback = values
    } else {
      config.values = values
    }
  }
  if (callback) {
    config.callback = callback
  }
  return config
}

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
const escapeIdentifier = function (str) {
  return '"' + str.replace(/"/g, '""') + '"'
}

const escapeLiteral = function (str) {
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

module.exports = {
  prepareValue: function prepareValueWrapper(value) {
    // this ensures that extra arguments do not get passed into prepareValue
    // by accident, eg: from calling values.map(utils.prepareValue)
    return prepareValue(value)
  },
  normalizeQueryConfig,
  escapeIdentifier,
  escapeLiteral,
}
