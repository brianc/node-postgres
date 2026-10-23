'use strict'

class Result {
  constructor(types, arrayMode) {
    this._types = types
    this._arrayMode = arrayMode

    this.command = undefined
    this.rowCount = undefined
    this.fields = []
    this.rows = []
    this._prebuiltEmptyResultObject = null
    this._parsers = []
  }

  consumeCommand(pq) {
    this.command = pq.cmdStatus().split(' ')[0]
    this.rowCount = parseInt(pq.cmdTuples(), 10)
  }

  consumeFields(pq) {
    const nfields = pq.nfields()
    this.fields = new Array(nfields)
    const row = {}
    this._parsers = new Array(nfields)
    for (let x = 0; x < nfields; x++) {
      const name = pq.fname(x)
      row[name] = null
      const typeId = pq.ftype(x)
      this.fields[x] = {
        name: name,
        dataTypeID: typeId,
      }
      this._parsers[x] = this._types.getTypeParser(typeId)
    }
    this._prebuiltEmptyResultObject = { ...row }
  }

  consumeRows(pq) {
    const tupleCount = pq.ntuples()
    this.rows = new Array(tupleCount)
    // all the values in one native call when libpq has it, instead of one or two calls per value
    const values = typeof pq.getvalues === 'function' ? pq.getvalues() : undefined
    for (let i = 0; i < tupleCount; i++) {
      this.rows[i] = this._arrayMode ? this.consumeRowAsArray(pq, i, values) : this.consumeRowAsObject(pq, i, values)
    }
  }

  consumeRowAsObject(pq, rowIndex, values) {
    const row = { ...this._prebuiltEmptyResultObject }
    for (let j = 0; j < this.fields.length; j++) {
      row[this.fields[j].name] = this.readValue(pq, rowIndex, j, values)
    }
    return row
  }

  consumeRowAsArray(pq, rowIndex, values) {
    const row = new Array(this.fields.length)
    for (let j = 0; j < this.fields.length; j++) {
      row[j] = this.readValue(pq, rowIndex, j, values)
    }
    return row
  }

  readValue(pq, rowIndex, colIndex, values) {
    if (values !== undefined) {
      const value = values[rowIndex * this.fields.length + colIndex]
      return value === null ? null : this._parsers[colIndex](value)
    }
    const rawValue = pq.getvalue(rowIndex, colIndex)
    if (rawValue === '' && pq.getisnull(rowIndex, colIndex)) {
      return null
    }
    return this._parsers[colIndex](rawValue)
  }
}

function buildResult(pq, types, arrayMode) {
  const result = new Result(types, arrayMode)
  result.consumeCommand(pq)
  result.consumeFields(pq)
  result.consumeRows(pq)

  return result
}

module.exports = buildResult
