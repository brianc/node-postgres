import { Buffer } from 'node:buffer'
import { types as utilTypes } from 'node:util'

import defaults from './defaults.ts'

const { isDate } = utilTypes

export interface QueryConfigInput {
  text?: string
  name?: string
  values?: unknown[]
  rows?: number
  types?: unknown
  callback?: (err: Error | null, result?: unknown) => void
  rowMode?: 'array' | undefined
  binary?: boolean
  portal?: string
  queryMode?: 'extended' | undefined
  query_timeout?: number | false
  [key: string]: unknown
}

function escapeElement(elementRepresentation: string): string {
  const escaped = elementRepresentation.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return '"' + escaped + '"'
}

// convert a JS array to a postgres array literal
// uses comma separator so won't work for types like box that use
// a different array separator.
function arrayString(val: unknown[]): string {
  let result = '{'
  for (let i = 0; i < val.length; i++) {
    if (i > 0) {
      result = result + ','
    }
    const item = val[i]
    if (item === null || typeof item === 'undefined') {
      result = result + 'NULL'
    } else if (Array.isArray(item)) {
      result = result + arrayString(item)
    } else if (ArrayBuffer.isView(item)) {
      let buf: Buffer
      if (Buffer.isBuffer(item)) {
        buf = item
      } else {
        const view = item as ArrayBufferView
        const fromBuf = Buffer.from(view.buffer, view.byteOffset, view.byteLength)
        if (fromBuf.length === view.byteLength) {
          buf = fromBuf
        } else {
          buf = fromBuf.slice(view.byteOffset, view.byteOffset + view.byteLength)
        }
      }
      result += '\\\\x' + buf.toString('hex')
    } else {
      result += escapeElement(prepareValueInternal(item))
    }
  }
  result = result + '}'
  return result
}

// converts values from javascript types to their 'raw' counterparts for use as a postgres parameter
function prepareValueInternal(val: unknown, seen?: unknown[]): string | Buffer | null {
  // null and undefined are both null for postgres
  if (val == null) {
    return null
  }
  if (typeof val === 'object') {
    if (Buffer.isBuffer(val)) {
      return val
    }
    if (ArrayBuffer.isView(val)) {
      const view = val as ArrayBufferView
      const buf = Buffer.from(view.buffer, view.byteOffset, view.byteLength)
      if (buf.length === view.byteLength) {
        return buf
      }
      return buf.slice(view.byteOffset, view.byteOffset + view.byteLength)
    }
    if (isDate(val as object)) {
      if (defaults.parseInputDatesAsUTC) {
        return dateToStringUTC(val as Date)
      }
      return dateToString(val as Date)
    }
    if (Array.isArray(val)) {
      return arrayString(val)
    }

    return prepareObject(val, seen)
  }
  return (val as { toString(): string }).toString()
}

function prepareObject(val: unknown, seen?: unknown[]): string {
  const candidate = val as { toPostgres?: (prepare: typeof prepareValue) => unknown }
  if (candidate && typeof candidate.toPostgres === 'function') {
    const visited = seen || []
    if (visited.indexOf(val) !== -1) {
      throw new Error('circular reference detected while preparing "' + (val as object) + '" for query')
    }
    visited.push(val)

    const result = candidate.toPostgres(prepareValue)
    return prepareValueInternal(result, visited) as string
  }
  return JSON.stringify(val)
}

function dateToString(date: Date): string {
  let offset = -date.getTimezoneOffset()

  let year = date.getFullYear()
  const isBCYear = year < 1
  if (isBCYear) year = Math.abs(year) + 1 // negative years are 1 off their BC representation

  let ret =
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

function dateToStringUTC(date: Date): string {
  let year = date.getUTCFullYear()
  const isBCYear = year < 1
  if (isBCYear) year = Math.abs(year) + 1

  let ret =
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

export function normalizeQueryConfig(
  config: string | QueryConfigInput,
  values?: unknown[] | ((err: Error | null, result?: unknown) => void),
  callback?: (err: Error | null, result?: unknown) => void
): QueryConfigInput {
  const cfg: QueryConfigInput = typeof config === 'string' ? { text: config } : config
  if (values) {
    if (typeof values === 'function') {
      cfg.callback = values
    } else {
      cfg.values = values
    }
  }
  if (callback) {
    cfg.callback = callback
  }
  return cfg
}

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
export function escapeIdentifier(str: string): string {
  return '"' + str.replace(/"/g, '""') + '"'
}

export function escapeLiteral(str: unknown): string {
  let hasBackslash = false
  let escaped = "'"

  if (str == null) {
    return "''"
  }

  if (typeof str !== 'string') {
    return "''"
  }

  for (let i = 0; i < str.length; i++) {
    const c = str[i]
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

// this ensures that extra arguments do not get passed into prepareValueInternal
// by accident, eg: from calling values.map(utils.prepareValue)
export function prepareValue(value: unknown): string | Buffer | null {
  return prepareValueInternal(value)
}

export interface PgUtils {
  prepareValue: typeof prepareValue
  normalizeQueryConfig: typeof normalizeQueryConfig
  escapeIdentifier: typeof escapeIdentifier
  escapeLiteral: typeof escapeLiteral
}

const utilsExport: PgUtils = {
  prepareValue,
  normalizeQueryConfig,
  escapeIdentifier,
  escapeLiteral,
}

export default utilsExport
