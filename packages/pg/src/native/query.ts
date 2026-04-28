import { EventEmitter } from 'node:events'

import { normalizeQueryConfig, prepareValue } from '../utils.ts'

import type { QueryConfigInput } from '../utils.ts'

type QueryCallback = (err: Error | null, result?: unknown) => void

interface NativeClientLike {
  native: {
    arrayMode: boolean
    pq: { resultErrorFields(): Record<string, string> | null | undefined }
    query(text: string, cb: NativeQueryCallback): void
    query(text: string, values: unknown[], cb: NativeQueryCallback): void
    prepare(name: string, text: string, length: number, cb: (err?: Error) => void): void
    execute(name: string, values: unknown[], cb: NativeQueryCallback): void
  }
  namedQueries: Record<string, string | undefined>
}

type NativeQueryCallback = (err: Error | undefined, rows: unknown[], results: unknown) => void

const errorFieldMap: Record<string, string> = {
  sqlState: 'code',
  statementPosition: 'position',
  messagePrimary: 'message',
  context: 'where',
  schemaName: 'schema',
  tableName: 'table',
  columnName: 'column',
  dataTypeName: 'dataType',
  constraintName: 'constraint',
  sourceFile: 'file',
  sourceLine: 'line',
  sourceFunction: 'routine',
}

class NativeQuery extends EventEmitter {
  text: string | undefined
  values: unknown[] | undefined
  name: string | undefined
  queryMode: 'extended' | undefined
  callback: QueryCallback | undefined
  state: 'new' | 'running' | 'end' | 'error' = 'new'
  _arrayMode: boolean
  _emitRowEvents = false
  native?: NativeClientLike['native']
  _promise?: Promise<unknown>

  constructor(config: string | QueryConfigInput, values?: unknown[] | QueryCallback, callback?: QueryCallback) {
    super()
    const cfg = normalizeQueryConfig(config, values, callback)
    this.text = cfg.text
    this.values = cfg.values
    this.name = cfg.name
    this.queryMode = cfg.queryMode
    this.callback = cfg.callback as QueryCallback | undefined
    this._arrayMode = cfg.rowMode === 'array'

    // if the 'row' event is listened for then emit them as they come in without setting
    // singleRowMode to true. this has almost no meaning because libpq reads all rows
    // into memory before returning any.
    this.on('newListener', (event: string) => {
      if (event === 'row') this._emitRowEvents = true
    })
  }

  handleError(err: Error & Record<string, string>): void {
    // copy pq error fields into the error object
    const fields = this.native!.pq.resultErrorFields()
    if (fields) {
      for (const key in fields) {
        const normalizedFieldName = errorFieldMap[key] || key
        ;(err as unknown as Record<string, string>)[normalizedFieldName] = fields[key]
      }
    }
    if (this.callback) {
      this.callback(err)
    } else {
      this.emit('error', err)
    }
    this.state = 'error'
  }

  then<T1 = unknown, T2 = never>(
    onSuccess?: ((value: unknown) => T1 | PromiseLike<T1>) | undefined | null,
    onFailure?: ((reason: unknown) => T2 | PromiseLike<T2>) | undefined | null
  ): Promise<T1 | T2> {
    return this._getPromise().then(onSuccess, onFailure)
  }

  catch(callback: (reason: unknown) => unknown): Promise<unknown> {
    return this._getPromise().catch(callback)
  }

  _getPromise(): Promise<unknown> {
    if (this._promise) return this._promise
    this._promise = new Promise((resolve, reject) => {
      this.once('end', resolve)
      this.once('error', reject)
    })
    return this._promise
  }

  submit(client: NativeClientLike): void {
    this.state = 'running'
    this.native = client.native
    client.native.arrayMode = this._arrayMode

    let after: NativeQueryCallback = (err, rows, results) => {
      client.native.arrayMode = false
      setImmediate(() => {
        this.emit('_done')
      })

      if (err) {
        this.handleError(err as Error & Record<string, string>)
        return
      }

      // emit row events for each row in the result
      if (this._emitRowEvents) {
        const list = results as unknown[]
        if (Array.isArray(list) && list.length > 1) {
          ;(rows as unknown[][]).forEach((rowOfRows, i) => {
            rowOfRows.forEach((row) => {
              this.emit('row', row, list[i])
            })
          })
        } else {
          ;(rows as unknown[]).forEach((row) => {
            this.emit('row', row, results)
          })
        }
      }

      this.state = 'end'
      this.emit('end', results)
      if (this.callback) {
        this.callback(null, results)
      }
    }

    const domain = (process as unknown as { domain?: { bind: (cb: unknown) => unknown } }).domain
    if (domain) {
      after = domain.bind(after) as NativeQueryCallback
    }

    // named query
    if (this.name) {
      if (this.name.length > 63) {
        console.error('Warning! Postgres only supports 63 characters for query names.')
        console.error('You supplied %s (%s)', this.name, this.name.length)
        console.error('This can cause conflicts and silent errors executing queries')
      }
      const values = (this.values || []).map(prepareValue) as unknown[]

      // check if the client has already executed this named query;
      // if so just execute it again - skip the planning phase
      if (client.namedQueries[this.name]) {
        if (this.text && client.namedQueries[this.name] !== this.text) {
          const err = new Error(
            `Prepared statements must be unique - '${this.name}' was used for a different statement`
          )
          after(err, [], undefined)
          return
        }
        client.native.execute(this.name, values, after)
        return
      }
      // plan the named query the first time, then execute it
      client.native.prepare(this.name, this.text!, values.length, (err) => {
        if (err) {
          after(err, [], undefined)
          return
        }
        client.namedQueries[this.name!] = this.text
        this.native!.execute(this.name!, values, after)
      })
      return
    }
    if (this.values) {
      if (!Array.isArray(this.values)) {
        const err = new Error('Query values must be an array')
        after(err, [], undefined)
        return
      }
      const vals = this.values.map(prepareValue) as unknown[]
      client.native.query(this.text!, vals, after)
      return
    }
    if (this.queryMode === 'extended') {
      client.native.query(this.text!, [], after)
      return
    }
    client.native.query(this.text!, after)
  }
}

export default NativeQuery
export { NativeQuery }
