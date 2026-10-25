'use strict'

const types = require('pg-types')
const TypeOverrides = require('./type-overrides')

const matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/

// Real workloads repeat a small set of result-set shapes, so the parser array and
// prebuilt empty row for a shape are cached per types object instead of rebuilt on
// every query. Entries are only cached against types objects whose registrations are
// versioned — TypeOverrides instances (see setTypeParser there) and the pg-types
// module — so late setTypeParser calls invalidate; arbitrary user-supplied types
// objects keep the uncached path since their behavior can change without notice.
const fieldMetadataCache = new WeakMap()
const FIELD_METADATA_CACHE_LIMIT = 1000

// Registrations on the global module must invalidate cached field metadata no matter
// how they arrive — pg.types.setTypeParser, defaults.parseInt8, or a direct pg-types
// require all mutate the same module object — so its setTypeParser is wrapped once
// to count them.
if (!types.__setTypeParserWrapped) {
  const setTypeParser = types.setTypeParser
  types.setTypeParser = function () {
    types.__typeParserVersion = (types.__typeParserVersion || 0) + 1
    return setTypeParser.apply(types, arguments)
  }
  types.__setTypeParserWrapped = true
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

  addRow(row) {
    this.rows.push(row)
  }

  addFields(fieldDescriptions) {
    // clears field definitions
    // multiple query statements in 1 action can result in multiple sets
    // of rowDescriptions...eg: 'select NOW(); select 1::int;'
    // you need to reset the fields
    this.fields = fieldDescriptions
    if (!fieldDescriptions.length) {
      this._prebuiltEmptyResultObject = {}
      return
    }

    const typesInstance = this._types || types
    const cacheable =
      typesInstance === types || (typesInstance instanceof TypeOverrides && typesInstance._types === types)
    if (!cacheable) {
      this._buildFieldMetadata(fieldDescriptions, typesInstance)
      return
    }

    // The global module's version is always folded in: TypeOverrides.getTypeParser
    // falls back to it for any oid without an instance-level override.
    const version = (typesInstance.__typeParserVersion || 0) + (types.__typeParserVersion || 0)
    let cacheEntry = fieldMetadataCache.get(typesInstance)
    if (!cacheEntry || cacheEntry.version !== version) {
      cacheEntry = { version, map: new Map() }
      fieldMetadataCache.set(typesInstance, cacheEntry)
    }

    // Postgres identifiers and wire strings cannot contain NUL, so '\0' cannot
    // collide with field names.
    let signature = ''
    for (let i = 0; i < fieldDescriptions.length; i++) {
      const desc = fieldDescriptions[i]
      signature += desc.name + '\0' + desc.dataTypeID + '\0' + (desc.format || 'text') + '\0'
    }

    const cached = cacheEntry.map.get(signature)
    if (cached) {
      this._parsers = cached.parsers
      this._prebuiltEmptyResultObject = cached.prebuiltEmptyResultObject
      return
    }

    this._buildFieldMetadata(fieldDescriptions, typesInstance)
    if (cacheEntry.map.size >= FIELD_METADATA_CACHE_LIMIT) {
      cacheEntry.map.clear()
    }
    cacheEntry.map.set(signature, {
      parsers: this._parsers,
      prebuiltEmptyResultObject: this._prebuiltEmptyResultObject,
    })
  }

  _buildFieldMetadata(fieldDescriptions, typesInstance) {
    this._parsers = new Array(fieldDescriptions.length)
    const row = Object.create(null)

    for (let i = 0; i < fieldDescriptions.length; i++) {
      const desc = fieldDescriptions[i]
      row[desc.name] = null
      this._parsers[i] = typesInstance.getTypeParser(desc.dataTypeID, desc.format || 'text')
    }

    this._prebuiltEmptyResultObject = { ...row }
  }
}

module.exports = Result
