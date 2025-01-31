'use strict'

class Result {
  constructor(types, arrayMode) {
    this._types = types
    this._arrayMode = arrayMode

    this.command = undefined
    this.rowCount = undefined
    this.fields = []
    this.rows = []
  }

  consumeCommand(pq) {
    this.command = pq.cmdStatus().split(' ')[0]
    this.rowCount = parseInt(pq.cmdTuples(), 10)
  }

  consumeFields(pq) {
    const nfields = pq.nfields()
    this.fields = new Array(nfields)
    for (let x = 0; x < nfields; x++) {
      this.fields[x] = {
        name: pq.fname(x),
        dataTypeID: pq.ftype(x),
      }
    }
  }

  consumeRows(pq) {
    const tupleCount = pq.ntuples()
    this.rows = new Array(tupleCount)
    for (let i = 0; i < tupleCount; i++) {
      this.rows[i] = this._arrayMode ? this.consumeRowAsArray(pq, i) : this.consumeRowAsObject(pq, i)
    }
  }

  consumeRowAsObject(pq, rowIndex) {
    const row = {}
    for (let j = 0; j < this.fields.length; j++) {
      row[this.fields[j].name] = this.readValue(pq, rowIndex, j)
    }
    return row
  }

  consumeRowAsArray(pq, rowIndex) {
    const row = new Array(this.fields.length)
    for (let j = 0; j < this.fields.length; j++) {
      row[j] = this.readValue(pq, rowIndex, j)
    }
    return row
  }

  readValue(pq, rowIndex, colIndex) {
    const rawValue = pq.getvalue(rowIndex, colIndex)
    if (rawValue === '' && pq.getisnull(rowIndex, colIndex)) {
      return null
    }
    const dataTypeId = this.fields[colIndex].dataTypeID
    return this._types.getTypeParser(dataTypeId)(rawValue)
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
