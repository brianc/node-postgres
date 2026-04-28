import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { deprecate } from 'node:util'

import ConnectionParameters from '../connection-parameters.ts'
import TypeOverrides from '../type-overrides.ts'
import NativeQuery from './query.ts'

import type { ClientConfig } from '../client.ts'
import type { QueryConfigInput } from '../utils.ts'

// `pg-native` is an optional peer; we resolve it eagerly via createRequire so any
// failure here surfaces with a clear error at module-load time rather than at
// obscure call sites later.
const requireFn = createRequire(import.meta.url)
const Native = requireFn('pg-native') as new (opts: { types: TypeOverrides }) => NativeBinding

interface NativeBinding {
  arrayMode: boolean
  pq: { resultErrorFields(): Record<string, string> | null | undefined }
  connect(connectionString: string, cb: (err?: Error) => void): void
  end(cb?: () => void): void
  query(text: string, cb: (err: Error | undefined, rows: unknown[], results: unknown) => void): void
  query(text: string, values: unknown[], cb: (err: Error | undefined, rows: unknown[], results: unknown) => void): void
  prepare(name: string, text: string, length: number, cb: (err?: Error) => void): void
  execute(
    name: string,
    values: unknown[],
    cb: (err: Error | undefined, rows: unknown[], results: unknown) => void
  ): void
  cancel(cb: (err?: Error) => void): void
  on(event: 'error', listener: (err: Error) => void): void
  on(event: 'notification', listener: (msg: { relname: string; extra: string }) => void): void
}

const queryQueueLengthDeprecationNotice = deprecate(
  () => {},
  'Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.'
)

type ConnectCallback = (err?: Error, client?: Client) => void
type QueryCallback = (err?: Error, result?: any) => void

export interface NativeClientConfig extends ClientConfig {
  nativeConnectionString?: string
}

class Client extends EventEmitter {
  static Query: typeof NativeQuery = NativeQuery

  _Promise: PromiseConstructorLike
  _types: TypeOverrides
  native: NativeBinding
  _queryQueue: NativeQuery[]
  _ending: boolean
  _connecting: boolean
  _connected: boolean
  _queryable: boolean
  _activeQuery?: NativeQuery | null
  connectionParameters: ConnectionParameters
  user: string | undefined
  password: string | null | ((connectionParameters: ConnectionParameters) => string | Promise<string>) | undefined
  database: string | undefined
  host: string
  port: number
  namedQueries: Record<string, string | undefined>

  constructor(config?: NativeClientConfig | null) {
    super()
    const cfg: NativeClientConfig = config || {}

    this._Promise = cfg.Promise || (globalThis.Promise as unknown as PromiseConstructorLike)
    this._types = new TypeOverrides(cfg.types as never)

    this.native = new Native({ types: this._types })

    this._queryQueue = []
    this._ending = false
    this._connecting = false
    this._connected = false
    this._queryable = true

    // keep these on the object for legacy reasons; TODO: deprecate all this jazz
    const cp = (this.connectionParameters = new ConnectionParameters(cfg))
    if (cfg.nativeConnectionString) cp.nativeConnectionString = cfg.nativeConnectionString
    this.user = cp.user

    Object.defineProperty(this, 'password', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: cp.password,
    })
    this.database = cp.database
    this.host = cp.host
    this.port = cp.port

    this.namedQueries = {}
  }

  _errorAllQueries(err: Error): void {
    const enqueueError = (query: NativeQuery) => {
      process.nextTick(() => {
        query.native = this.native
        query.handleError(err as Error & Record<string, string>)
      })
    }

    if (this._hasActiveQuery()) {
      enqueueError(this._activeQuery!)
      this._activeQuery = null
    }

    this._queryQueue.forEach(enqueueError)
    this._queryQueue.length = 0
  }

  // connect to the backend; pass an optional callback to be called once connected
  // or with an error if there was a connection error
  _connect(cb: ConnectCallback): void {
    if (this._connecting) {
      process.nextTick(() => cb(new Error('Client has already been connected. You cannot reuse a client.')))
      return
    }

    this._connecting = true

    this.connectionParameters.getLibpqConnectionString((err, conString) => {
      let resolvedString: string | null = conString
      if (this.connectionParameters.nativeConnectionString) {
        resolvedString = this.connectionParameters.nativeConnectionString
      }
      if (err) {
        cb(err)
        return
      }
      this.native.connect(resolvedString!, (connectErr) => {
        if (connectErr) {
          this.native.end()
          cb(connectErr)
          return
        }

        this._connected = true

        // handle connection errors from the native layer
        this.native.on('error', (e: Error) => {
          this._queryable = false
          this._errorAllQueries(e)
          this.emit('error', e)
        })

        this.native.on('notification', (msg: { relname: string; extra: string }) => {
          this.emit('notification', {
            channel: msg.relname,
            payload: msg.extra,
          })
        })

        this.emit('connect')
        this._pulseQueryQueue(true)

        cb(null as never, this)
      })
    })
  }

  connect(callback: ConnectCallback): void
  connect(): Promise<Client>
  connect(callback?: ConnectCallback): void | Promise<Client> {
    if (callback) {
      this._connect(callback)
      return
    }

    return new (this._Promise as PromiseConstructor)<Client>((resolve, reject) => {
      this._connect((error) => {
        if (error) {
          reject(error)
        } else {
          resolve(this)
        }
      })
    })
  }

  query(
    config: string | QueryConfigInput | NativeQuery,
    values?: unknown[] | QueryCallback,
    callback?: QueryCallback
  ): unknown {
    let query: NativeQuery
    let result: unknown
    let readTimeout: number | false | undefined
    let readTimeoutTimer: ReturnType<typeof setTimeout> | undefined
    let queryCallback: QueryCallback | undefined

    if (config === null || config === undefined) {
      throw new TypeError('Client was passed a null or undefined query')
    } else if (typeof (config as NativeQuery).submit === 'function') {
      readTimeout = (config as QueryConfigInput).query_timeout || this.connectionParameters.query_timeout
      result = query = config as NativeQuery
      // accept query(new Query(...), (err, res) => { }) style
      if (typeof values === 'function') {
        ;(config as { callback?: QueryCallback }).callback = values
      }
    } else {
      readTimeout = (config as QueryConfigInput).query_timeout || this.connectionParameters.query_timeout
      query = new NativeQuery(config as string | QueryConfigInput, values as never, callback)
      if (!query.callback) {
        let resolveOut: (v: unknown) => void
        let rejectOut: (e: unknown) => void
        result = new (this._Promise as PromiseConstructor)((resolve, reject) => {
          resolveOut = resolve
          rejectOut = reject
        }).catch((err: Error) => {
          Error.captureStackTrace(err)
          throw err
        })
        query.callback = (err, res) => (err ? rejectOut(err) : resolveOut(res))
      }
    }

    if (readTimeout) {
      queryCallback = query.callback || (() => {})

      readTimeoutTimer = setTimeout(() => {
        const error = new Error('Query read timeout')

        process.nextTick(() => {
          query.handleError(error as Error & Record<string, string>)
        })

        queryCallback!(error)

        // we already returned an error, just do nothing if query completes
        query.callback = () => {}

        const index = this._queryQueue.indexOf(query)
        if (index > -1) {
          this._queryQueue.splice(index, 1)
        }

        this._pulseQueryQueue()
      }, readTimeout)

      query.callback = (err, res) => {
        clearTimeout(readTimeoutTimer)
        queryCallback!(err, res)
      }
    }

    if (!this._queryable) {
      query.native = this.native
      process.nextTick(() => {
        query.handleError(
          new Error('Client has encountered a connection error and is not queryable') as Error & Record<string, string>
        )
      })
      return result
    }

    if (this._ending) {
      query.native = this.native
      process.nextTick(() => {
        query.handleError(new Error('Client was closed and is not queryable') as Error & Record<string, string>)
      })
      return result
    }

    if (this._queryQueue.length > 0) {
      queryQueueLengthDeprecationNotice()
    }

    this._queryQueue.push(query)
    this._pulseQueryQueue()
    return result
  }

  end(cb: () => void): void
  end(): Promise<void>
  end(cb?: () => void): void | Promise<void> {
    this._ending = true

    if (!this._connected) {
      this.once('connect', () => {
        ;(this as { end: (cb?: () => void) => void | Promise<void> }).end(cb)
      })
    }
    let result: Promise<void> | undefined
    let finalCb: (() => void) | undefined = cb
    if (!finalCb) {
      result = new (this._Promise as PromiseConstructor)<void>((resolve, reject) => {
        finalCb = (err?: Error) => (err ? reject(err) : resolve())
      })
    }

    this.native.end(() => {
      this._connected = false

      this._errorAllQueries(new Error('Connection terminated'))

      process.nextTick(() => {
        this.emit('end')
        if (finalCb) finalCb()
      })
    })
    return result
  }

  _hasActiveQuery(): boolean {
    return !!(this._activeQuery && this._activeQuery.state !== 'error' && this._activeQuery.state !== 'end')
  }

  _pulseQueryQueue(initialConnection?: boolean): void {
    if (!this._connected) {
      return
    }
    if (this._hasActiveQuery()) {
      return
    }
    const query = this._queryQueue.shift()
    if (!query) {
      if (!initialConnection) {
        this.emit('drain')
      }
      return
    }
    this._activeQuery = query
    query.submit(this as never)
    query.once('_done', () => {
      this._pulseQueryQueue()
    })
  }

  // attempt to cancel an in-progress query
  cancel(query: NativeQuery): void {
    if (this._activeQuery === query) {
      this.native.cancel(() => {})
    } else if (this._queryQueue.indexOf(query) !== -1) {
      this._queryQueue.splice(this._queryQueue.indexOf(query), 1)
    }
  }

  ref(): void {}

  unref(): void {}

  setTypeParser(oid: number, format: never, parseFn?: never): void {
    return this._types.setTypeParser(oid, format, parseFn)
  }

  getTypeParser(oid: number, format?: never): unknown {
    return this._types.getTypeParser(oid, format)
  }

  isConnected(): boolean {
    return this._connected
  }
}

export default Client
export { Client }
