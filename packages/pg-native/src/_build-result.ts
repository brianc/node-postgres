import type Libpq from 'libpq'

export interface TypesLike {
  getTypeParser: (oid: number, format?: string) => (value: string) => unknown
}

export interface ResultField {
  name: string
  dataTypeID: number
}

export type Row = Record<string, unknown> | unknown[]

export class Result {
  public command: string | undefined
  public rowCount: number | undefined
  public fields: ResultField[]
  public rows: Row[]

  private _types: TypesLike
  private _arrayMode: boolean
  private _prebuiltEmptyResultObject: Record<string, unknown> | null
  private _parsers: Array<(value: string) => unknown>

  constructor(types: TypesLike, arrayMode: boolean) {
    this._types = types
    this._arrayMode = arrayMode

    this.command = undefined
    this.rowCount = undefined
    this.fields = []
    this.rows = []
    this._prebuiltEmptyResultObject = null
    this._parsers = []
  }

  consumeCommand(pq: Libpq): void {
    this.command = pq.cmdStatus().split(' ')[0]
    this.rowCount = Number.parseInt(pq.cmdTuples(), 10)
  }

  consumeFields(pq: Libpq): void {
    const nfields = pq.nfields()
    this.fields = new Array(nfields)
    const row: Record<string, unknown> = {}
    this._parsers = new Array(nfields)
    for (let x = 0; x < nfields; x++) {
      const name = pq.fname(x)
      row[name] = null
      const typeId = pq.ftype(x)
      this.fields[x] = {
        name,
        dataTypeID: typeId,
      }
      this._parsers[x] = this._types.getTypeParser(typeId) as (value: string) => unknown
    }
    this._prebuiltEmptyResultObject = { ...row }
  }

  consumeRows(pq: Libpq): void {
    const tupleCount = pq.ntuples()
    this.rows = new Array(tupleCount)
    for (let i = 0; i < tupleCount; i++) {
      this.rows[i] = this._arrayMode ? this.consumeRowAsArray(pq, i) : this.consumeRowAsObject(pq, i)
    }
  }

  consumeRowAsObject(pq: Libpq, rowIndex: number): Record<string, unknown> {
    const row: Record<string, unknown> = { ...this._prebuiltEmptyResultObject }
    for (let j = 0; j < this.fields.length; j++) {
      row[this.fields[j]!.name] = this.readValue(pq, rowIndex, j)
    }
    return row
  }

  consumeRowAsArray(pq: Libpq, rowIndex: number): unknown[] {
    const row = new Array(this.fields.length)
    for (let j = 0; j < this.fields.length; j++) {
      row[j] = this.readValue(pq, rowIndex, j)
    }
    return row
  }

  readValue(pq: Libpq, rowIndex: number, colIndex: number): unknown {
    const rawValue = pq.getvalue(rowIndex, colIndex)
    if (rawValue === '' && pq.getisnull(rowIndex, colIndex)) {
      return null
    }
    return this._parsers[colIndex]!(rawValue)
  }
}

export function buildResult(pq: Libpq, types: TypesLike, arrayMode: boolean): Result {
  const result = new Result(types, arrayMode)
  result.consumeCommand(pq)
  result.consumeFields(pq)
  result.consumeRows(pq)
  return result
}

export default buildResult
