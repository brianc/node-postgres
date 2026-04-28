import { EventEmitter } from 'node:events'

import Result from './result.ts'
import { normalizeQueryConfig, prepareValue } from './utils.ts'

import type { CommandCompleteMessage, FieldDef } from './result.ts'
import type { QueryConfigInput } from './utils.ts'

interface DataRowMessage {
  fields: Array<string | Buffer | null>
}

interface RowDescriptionMessage {
  fields: FieldDef[]
}

type QueryCallback = (err: Error | null, result?: unknown) => void

interface ConnectionLike {
  parsedStatements: Record<string, string | undefined>
  query(text: string): void
  parse(opts: { text?: string; name?: string; types?: unknown }): void
  bind(opts: { portal: string; statement?: string; values?: unknown[]; binary?: boolean; valueMapper?: unknown }): void
  describe(opts: { type: 'P' | 'S'; name: string }): void
  execute(opts: { portal?: string; rows?: number }): void
  sync(): void
  flush(): void
  sendCopyFail(msg: string): void
  stream: { cork?: () => void; uncork?: () => void } & Record<string, unknown>
}

class Query extends EventEmitter {
  text: string | undefined
  values: unknown[] | undefined
  rows: number | undefined
  types: unknown
  name: string | undefined
  queryMode: 'extended' | undefined
  binary: boolean | undefined
  portal: string
  callback: QueryCallback | undefined
  _rowMode: 'array' | string | undefined
  _result: Result
  _results: Result | Result[]
  _canceledDueToError: false | Error
  _accumulateRows?: boolean

  constructor(config: string | QueryConfigInput, values?: unknown[] | QueryCallback, callback?: QueryCallback) {
    super()

    const cfg = normalizeQueryConfig(config, values, callback)

    this.text = cfg.text
    this.values = cfg.values
    this.rows = cfg.rows
    this.types = cfg.types
    this.name = cfg.name
    this.queryMode = cfg.queryMode
    this.binary = cfg.binary
    // use unique portal name each time
    this.portal = cfg.portal || ''
    this.callback = cfg.callback as QueryCallback | undefined
    this._rowMode = cfg.rowMode
    const domain = (process as unknown as { domain?: { bind: (cb: unknown) => unknown } }).domain
    if (domain && cfg.callback) {
      this.callback = domain.bind(cfg.callback) as QueryCallback
    }
    this._result = new Result(this._rowMode, this.types as never)

    // potential for multiple results
    this._results = this._result
    this._canceledDueToError = false
  }

  requiresPreparation(): boolean {
    if (this.queryMode === 'extended') {
      return true
    }
    // named queries must always be prepared
    if (this.name) {
      return true
    }
    // always prepare if there are max number of rows expected per portal execution
    if (this.rows) {
      return true
    }
    // don't prepare empty text queries
    if (!this.text) {
      return false
    }
    // prepare if there are values
    if (!this.values) {
      return false
    }
    return this.values.length > 0
  }

  _checkForMultirow(): void {
    // if we already have a result with a command property
    // then we've already executed one query in a multi-statement simple query
    // turn our results into an array of results
    if (this._result.command) {
      if (!Array.isArray(this._results)) {
        this._results = [this._result]
      }
      this._result = new Result(this._rowMode, this._result._types)
      this._results.push(this._result)
    }
  }

  // associates row metadata from the supplied message with this query object,
  // metadata used when parsing row results
  handleRowDescription(msg: RowDescriptionMessage): void {
    this._checkForMultirow()
    this._result.addFields(msg.fields)
    this._accumulateRows = !!this.callback || !this.listeners('row').length
  }

  handleDataRow(msg: DataRowMessage): void {
    let row: unknown

    if (this._canceledDueToError) {
      return
    }

    try {
      row = this._result.parseRow(msg.fields)
    } catch (err) {
      this._canceledDueToError = err as Error
      return
    }

    this.emit('row', row, this._result)
    if (this._accumulateRows) {
      this._result.addRow(row as never)
    }
  }

  handleCommandComplete(msg: CommandCompleteMessage, connection: ConnectionLike): void {
    this._checkForMultirow()
    this._result.addCommandComplete(msg)
    // need to sync after each command complete of a prepared statement
    // if we were using a row count which results in multiple calls to _getRows
    if (this.rows) {
      connection.sync()
    }
  }

  // if a named prepared statement is created with empty query text, the backend will
  // send an emptyQuery message but *not* a command complete message; we already
  // pipeline sync immediately after execute, so we don't need to do anything here
  // unless we have rows specified, in which case we did not pipeline the initial sync.
  handleEmptyQuery(connection: ConnectionLike): void {
    if (this.rows) {
      connection.sync()
    }
  }

  handleError(err: Error, _connection?: ConnectionLike): void {
    // need to sync after error during a prepared statement
    if (this._canceledDueToError) {
      err = this._canceledDueToError
      this._canceledDueToError = false
    }
    // if callback supplied do not emit error event as uncaught error
    // events will bubble up to node process
    if (this.callback) {
      this.callback(err)
      return
    }
    this.emit('error', err)
  }

  handleReadyForQuery(con: ConnectionLike): void {
    if (this._canceledDueToError) {
      this.handleError(this._canceledDueToError, con)
      return
    }
    if (this.callback) {
      try {
        this.callback(null, this._results)
      } catch (err) {
        process.nextTick(() => {
          throw err
        })
      }
    }
    this.emit('end', this._results)
  }

  submit(connection: ConnectionLike): Error | null {
    if (typeof this.text !== 'string' && typeof this.name !== 'string') {
      return new Error('A query must have either text or a name. Supplying neither is unsupported.')
    }
    const previous = connection.parsedStatements[this.name as string]
    if (this.text && previous && this.text !== previous) {
      return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`)
    }
    if (this.values && !Array.isArray(this.values)) {
      return new Error('Query values must be an array')
    }
    if (this.requiresPreparation()) {
      // If we're using the extended query protocol we fire off several separate commands
      // to the backend. On some versions of node & some operating system versions
      // the network stack writes each message separately instead of buffering them
      // together causing the client & network to send more slowly. Corking & uncorking
      // the stream allows node to buffer up the messages internally before sending
      // them all off at once. Note: we're checking for existence of cork/uncork because
      // some versions of streams might not have this (cloudflare?).
      connection.stream.cork && connection.stream.cork()
      try {
        this.prepare(connection)
      } finally {
        // while unlikely for this.prepare to throw, if it does & we don't uncork this
        // stream this client becomes unresponsive, so put in finally block "just in case"
        connection.stream.uncork && connection.stream.uncork()
      }
    } else {
      connection.query(this.text!)
    }
    return null
  }

  hasBeenParsed(connection: ConnectionLike): boolean {
    return !!(this.name && connection.parsedStatements[this.name])
  }

  handlePortalSuspended(connection: ConnectionLike): void {
    this._getRows(connection, this.rows)
  }

  _getRows(connection: ConnectionLike, rows: number | undefined): void {
    connection.execute({
      portal: this.portal,
      rows,
    })
    // if we're not reading pages of rows send the sync command to indicate the
    // pipeline is finished
    if (!rows) {
      connection.sync()
    } else {
      // otherwise flush the call out to read more rows
      connection.flush()
    }
  }

  // http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
  prepare(connection: ConnectionLike): void {
    if (!this.hasBeenParsed(connection)) {
      connection.parse({
        text: this.text,
        name: this.name,
        types: this.types,
      })
    }

    // because we're mapping user supplied values to postgres wire protocol compatible
    // values it could throw an exception, so try/catch this section
    try {
      connection.bind({
        portal: this.portal,
        statement: this.name,
        values: this.values,
        binary: this.binary,
        valueMapper: prepareValue,
      })
    } catch (err) {
      this.handleError(err as Error, connection)
      return
    }

    connection.describe({
      type: 'P',
      name: this.portal || '',
    })

    this._getRows(connection, this.rows)
  }

  handleCopyInResponse(connection: ConnectionLike): void {
    connection.sendCopyFail('No source stream defined')
  }

  handleCopyData(_msg: unknown, _connection: ConnectionLike): void {
    // noop
  }
}

export default Query
export { Query }
