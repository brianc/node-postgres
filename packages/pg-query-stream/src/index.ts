import { Readable } from 'node:stream'
import type { Connection, Submittable } from 'pg'
import Cursor from 'pg-cursor'

export interface QueryStreamConfig {
  batchSize?: number
  highWaterMark?: number
  rowMode?: 'array'
  types?: {
    getTypeParser: (oid: number, format?: string) => (value: unknown) => unknown
  }
}

type QueryStreamCallback = (err: Error | null, result?: unknown) => void

class QueryStream extends Readable implements Submittable {
  cursor: Cursor
  _result: unknown

  callback?: QueryStreamCallback
  handleRowDescription: (...args: unknown[]) => void
  handleDataRow: (...args: unknown[]) => void
  handlePortalSuspended: (...args: unknown[]) => void
  handleCommandComplete: (...args: unknown[]) => void
  handleReadyForQuery: (...args: unknown[]) => void
  handleError: (...args: unknown[]) => void
  handleEmptyQuery: (...args: unknown[]) => void

  public constructor(text: string, values?: unknown[], config: QueryStreamConfig = {}) {
    const { batchSize, highWaterMark = 100 } = config

    super({ objectMode: true, autoDestroy: true, highWaterMark: batchSize || highWaterMark })
    this.cursor = new Cursor(text, values, config)
    this.cursor
      .on('end', (result: unknown) => {
        this.callback?.(null, result)
      })
      .on('error', (err: Error) => {
        this.callback?.(err)
      })

    // delegate Submittable callbacks to cursor
    const cursor = this.cursor as unknown as Record<string, (...args: unknown[]) => void>
    this.handleRowDescription = cursor.handleRowDescription.bind(this.cursor)
    this.handleDataRow = cursor.handleDataRow.bind(this.cursor)
    this.handlePortalSuspended = cursor.handlePortalSuspended.bind(this.cursor)
    this.handleCommandComplete = cursor.handleCommandComplete.bind(this.cursor)
    this.handleReadyForQuery = cursor.handleReadyForQuery.bind(this.cursor)
    this.handleError = cursor.handleError.bind(this.cursor)
    this.handleEmptyQuery = cursor.handleEmptyQuery.bind(this.cursor)

    // pg client sets types via _result property
    this._result = (this.cursor as unknown as { _result: unknown })._result
  }

  public submit(connection: Connection): void {
    ;(this.cursor as unknown as { submit(c: Connection): void }).submit(connection)
  }

  public override _destroy(_err: Error | null, cb: (err: Error | null) => void): void {
    this.cursor.close((err) => {
      cb(err || _err)
    })
  }

  // https://nodejs.org/api/stream.html#stream_readable_read_size_1
  public override _read(size: number): void {
    this.cursor.read(size, (err, rows) => {
      if (err) {
        // https://nodejs.org/api/stream.html#stream_errors_while_reading
        this.destroy(err)
      } else if (rows) {
        for (const row of rows) this.push(row)
        if (rows.length < size) this.push(null)
      }
    })
  }
}

export { QueryStream }
export default QueryStream
