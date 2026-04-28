import { Buffer } from 'node:buffer'

import * as types from 'pg-types'

import type { TypeParser } from 'pg-types'

import type TypeOverrides from './type-overrides.ts'

const matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/

export interface FieldDef {
  name: string
  tableID: number
  columnID: number
  dataTypeID: number
  dataTypeSize: number
  dataTypeModifier: number
  format: 'text' | 'binary' | string
}

export interface CommandCompleteMessage {
  text?: string
  command?: string
}

// result object returned from query, in the 'end' event and also passed as
// second argument to provided callback
class Result<R = Record<string, unknown>> {
  command: string | null = null
  rowCount: number | null = null
  oid: number | null = null
  rows: R[] = []
  fields: FieldDef[] = []
  _parsers: TypeParser[] | undefined
  _types: TypeOverrides | undefined
  RowCtor: unknown = null
  rowAsArray: boolean
  _prebuiltEmptyResultObject: Record<string, null> | null = null

  constructor(rowMode?: 'array' | string, rowTypes?: TypeOverrides) {
    this._types = rowTypes
    this.rowAsArray = rowMode === 'array'
    if (this.rowAsArray) {
      this.parseRow = this._parseRowAsArray as unknown as Result<R>['parseRow']
    }
  }

  // adds a command complete message
  addCommandComplete(msg: CommandCompleteMessage): void {
    let match: RegExpExecArray | null
    if (msg.text) {
      // pure javascript
      match = matchRegexp.exec(msg.text)
    } else {
      // native bindings
      match = matchRegexp.exec(msg.command || '')
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

  _parseRowAsArray(rowData: Array<string | Buffer | null>): unknown[] {
    const row = new Array(rowData.length)
    for (let i = 0, len = rowData.length; i < len; i++) {
      const rawValue = rowData[i]
      if (rawValue !== null) {
        row[i] = this._parsers![i](rawValue)
      } else {
        row[i] = null
      }
    }
    return row
  }

  parseRow(rowData: Array<string | Buffer | null>): R {
    const row: Record<string, unknown> = { ...this._prebuiltEmptyResultObject }
    for (let i = 0, len = rowData.length; i < len; i++) {
      const rawValue = rowData[i]
      const field = this.fields[i].name
      if (rawValue !== null) {
        const v =
          this.fields[i].format === 'binary' && typeof rawValue !== 'string'
            ? Buffer.from(rawValue as Buffer)
            : (rawValue as string | Buffer)
        row[field] = this._parsers![i](v)
      } else {
        row[field] = null
      }
    }
    return row as R
  }

  addRow(row: R): void {
    this.rows.push(row)
  }

  addFields(fieldDescriptions: FieldDef[]): void {
    // clears field definitions; multiple query statements in 1 action can result in
    // multiple sets of rowDescriptions, so we reset.
    this.fields = fieldDescriptions
    if (this.fields.length) {
      this._parsers = new Array<TypeParser>(fieldDescriptions.length)
    }

    const row: Record<string, null> = {}

    for (let i = 0; i < fieldDescriptions.length; i++) {
      const desc = fieldDescriptions[i]
      row[desc.name] = null

      if (this._types) {
        this._parsers![i] = this._types.getTypeParser(desc.dataTypeID, desc.format || 'text')
      } else {
        this._parsers![i] = types.getTypeParser(desc.dataTypeID, (desc.format || 'text') as 'text' | 'binary')
      }
    }

    this._prebuiltEmptyResultObject = { ...row }
  }
}

export default Result
export { Result }
