import { EventEmitter } from 'node:events'
import { deprecate } from 'node:util'
import { Result, utils as pgUtils } from 'pg'

const { prepareValue } = pgUtils

let nextUniqueID = 1 // concept borrowed from org.postgresql.core.v3.QueryExecutorImpl

export interface CursorTypes {
  getTypeParser: (oid: number, format?: string) => (value: unknown) => unknown
}

export interface CursorOptions {
  rowMode?: 'array' | undefined
  types?: CursorTypes
  Promise?: PromiseConstructorLike
}

export interface CursorQueryConfig {
  text: string
  values?: unknown[]
  rowMode?: 'array' | undefined
  types?: CursorTypes
}

export type CursorReadCallback<R = unknown> = (err?: Error | null, rows?: R[], result?: Result) => void

export type CursorCloseCallback = (err?: Error | null) => void

type CursorState = 'initialized' | 'submitted' | 'idle' | 'busy' | 'done' | 'error'

interface CursorConnection extends EventEmitter {
  parse: (msg: { text: string }, more: boolean) => void
  bind: (msg: { portal: string; values: unknown[] | null }, more: boolean) => void
  describe: (msg: { type: string; name: string }, more: boolean) => void
  execute: (msg: { portal: string; rows: number }, more: boolean) => void
  close: (msg: { type: string; name: string }) => void
  flush: () => void
  sync: () => void
  end: () => void
}

class Cursor<R = unknown> extends EventEmitter {
  public text: string
  public values: unknown[] | null
  public connection: CursorConnection | null
  public state: CursorState

  private _conf: CursorOptions
  private _queue: Array<[number, CursorReadCallback<R>]>
  private _result: Result
  private _Promise: PromiseConstructorLike
  private _cb: CursorReadCallback<R> | null
  private _rows: R[] | null
  private _portal: string | null
  private _error: Error | undefined

  constructor(text: string, values?: unknown[] | null, config?: CursorOptions) {
    super()

    this._conf = config || {}
    this.text = text
    this.values = values ? values.map((v: unknown) => prepareValue(v)) : null
    this.connection = null
    this._queue = []
    this.state = 'initialized'
    this._result = new Result(this._conf.rowMode, this._conf.types as never)
    this._Promise = this._conf.Promise || globalThis.Promise
    this._cb = null
    this._rows = null
    this._portal = null
    this._ifNoData = this._ifNoData.bind(this)
    this._rowDescription = this._rowDescription.bind(this)
  }

  private _ifNoData(): void {
    this.state = 'idle'
    this._shiftQueue()
    if (this.connection) {
      this.connection.removeListener('rowDescription', this._rowDescription)
    }
  }

  private _rowDescription(): void {
    if (this.connection) {
      this.connection.removeListener('noData', this._ifNoData)
    }
  }

  submit(connection: CursorConnection): void {
    this.state = 'submitted'
    this.connection = connection
    this._portal = 'C_' + nextUniqueID++

    const con = connection

    con.parse(
      {
        text: this.text,
      },
      true
    )

    con.bind(
      {
        portal: this._portal,
        values: this.values,
      },
      true
    )

    con.describe(
      {
        type: 'P',
        name: this._portal, // AWS Redshift requires a portal name
      },
      true
    )

    con.flush()

    if (this._conf.types) {
      ;(this._result as unknown as { _getTypeParser: unknown })._getTypeParser = this._conf.types.getTypeParser
    }

    con.once('noData', this._ifNoData)
    con.once('rowDescription', this._rowDescription)
  }

  private _shiftQueue(): void {
    if (this._queue.length) {
      const next = this._queue.shift()!
      this._getRows(next[0], next[1])
    }
  }

  private _closePortal(): void {
    if (this.state === 'done') return

    // because we opened a named portal to stream results
    // we need to close the same named portal.  Leaving a named portal
    // open can lock tables for modification if inside a transaction.
    // see https://github.com/brianc/node-pg-cursor/issues/56
    this.connection!.close({ type: 'P', name: this._portal! })

    // If we've received an error we already sent a sync message.
    // do not send another sync as it triggers another readyForQuery message.
    if (this.state !== 'error') {
      this.connection!.sync()
    }

    this.state = 'done'
  }

  handleRowDescription(msg: { fields: unknown[] }): void {
    this._result.addFields(msg.fields as never)
    this.state = 'idle'
    this._shiftQueue()
  }

  handleDataRow(msg: { fields: unknown[] }): void {
    const row = this._result.parseRow(msg.fields as Array<string | Buffer | null>) as R
    this.emit('row', row, this._result)
    this._rows!.push(row)
  }

  private _sendRows(): void {
    this.state = 'idle'
    setImmediate(() => {
      const cb = this._cb
      // remove callback before calling it
      // because likely a new one will be added
      // within the call to this callback
      this._cb = null
      if (cb) {
        this._result.rows = this._rows as never
        cb(null, this._rows!, this._result)
      }
      this._rows = []
    })
  }

  handleCommandComplete(msg: { text?: string; command?: string }): void {
    this._result.addCommandComplete(msg)
    this._closePortal()
  }

  handlePortalSuspended(): void {
    this._sendRows()
  }

  handleReadyForQuery(): void {
    this._sendRows()
    this.state = 'done'
    this.emit('end', this._result)
  }

  handleEmptyQuery(): void {
    this.connection!.sync()
  }

  handleError(msg: Error): void {
    // If this cursor has already closed, don't try to handle the error.
    if (this.state === 'done') return

    // If we're in an initialized state we've never been submitted
    // and don't have a connection instance reference yet.
    // This can happen if you queue a stream and close the client before
    // the client has submitted the stream.  In this scenario we don't have
    // a connection so there's nothing to unsubscribe from.
    if (this.state !== 'initialized') {
      this.connection!.removeListener('noData', this._ifNoData)
      this.connection!.removeListener('rowDescription', this._rowDescription)
      // call sync to trigger a readyForQuery
      this.connection!.sync()
    }

    this.state = 'error'
    this._error = msg
    // satisfy any waiting callback
    if (this._cb) {
      this._cb(msg)
    }
    // dispatch error to all waiting callbacks
    for (let i = 0; i < this._queue.length; i++) {
      const queuedCallback = this._queue[i][1]
      queuedCallback.call(this, msg)
    }
    this._queue.length = 0

    if (this.listenerCount('error') > 0) {
      // only dispatch error events if we have a listener
      this.emit('error', msg)
    }
  }

  private _getRows(rows: number, cb: CursorReadCallback<R>): void {
    this.state = 'busy'
    this._cb = cb
    this._rows = []
    const msg = {
      portal: this._portal!,
      rows: rows,
    }
    this.connection!.execute(msg, true)
    this.connection!.flush()
  }

  // users really shouldn't be calling 'end' here and terminating a connection to postgres
  // via the low level connection.end api
  end(cb: () => void): void {
    if (this.state !== 'initialized') {
      this.connection!.sync()
    }
    this.connection!.once('end', cb)
    this.connection!.end()
  }

  close(): Promise<void>
  close(cb: CursorCloseCallback): void
  close(cb?: CursorCloseCallback): Promise<void> | void {
    let promise: Promise<void> | undefined

    if (!cb) {
      promise = new (this._Promise as PromiseConstructor)<void>((resolve, reject) => {
        cb = (err) => (err ? reject(err) : resolve())
      })
    }

    if (!this.connection || this.state === 'done') {
      setImmediate(cb!)
      return promise
    }

    this._closePortal()
    this.connection.once('readyForQuery', function () {
      cb!()
    })

    // Return the promise (or undefined)
    return promise
  }

  read(rows: number): Promise<R[]>
  read(rows: number, cb: CursorReadCallback<R>): void
  read(rows: number, cb?: CursorReadCallback<R>): Promise<R[]> | void {
    let promise: Promise<R[]> | undefined

    if (!cb) {
      promise = new (this._Promise as PromiseConstructor)<R[]>((resolve, reject) => {
        cb = (err, rs) => (err ? reject(err) : resolve(rs!))
      })
    }

    if (this.state === 'idle' || this.state === 'submitted') {
      this._getRows(rows, cb!)
    } else if (this.state === 'busy' || this.state === 'initialized') {
      this._queue.push([rows, cb!])
    } else if (this.state === 'error') {
      setImmediate(() => cb!(this._error))
    } else if (this.state === 'done') {
      setImmediate(() => cb!(null, []))
    } else {
      throw new Error('Unknown state: ' + this.state)
    }

    // Return the promise (or undefined)
    return promise
  }
}

Cursor.prototype.end = deprecate(
  Cursor.prototype.end,
  'Cursor.end is deprecated. Call end on the client itself to end a connection to the database.'
)

export { Cursor }
export default Cursor
