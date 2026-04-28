import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import type {
  Client,
  ClientConfig,
  QueryArrayConfig,
  QueryArrayResult,
  QueryConfig,
  QueryResult,
  QueryResultRow,
  Submittable,
} from 'pg'

const require = createRequire(import.meta.url)

const NOOP = function (): void {}

const removeWhere = <T>(list: T[], predicate: (item: T) => boolean): T | undefined => {
  const i = list.findIndex(predicate)

  return i === -1 ? undefined : list.splice(i, 1)[0]
}

export type ClientConstructor = new (options?: PoolOptions) => Client

export type LogFn = (...messages: unknown[]) => void

export type ConnectCallback<C extends PoolClient = PoolClient> = (
  err: Error | undefined,
  client: C | undefined,
  release: ReleaseCallback
) => void

export type ReleaseCallback = (err?: Error | boolean) => void

export type VerifyCallback<C extends PoolClient = PoolClient> = (client: C, done: (err?: Error) => void) => void

export type OnConnectHook<C extends PoolClient = PoolClient> = (client: C) => void | Promise<void>

export interface PoolOptions extends ClientConfig {
  /** Maximum number of clients the pool may keep open at once. */
  max?: number
  /** Backwards-compatible alias for `max`. */
  poolSize?: number
  /** Minimum number of clients to keep idle. */
  min?: number
  /** Maximum number of times a single client can be checked out before being recycled. */
  maxUses?: number
  /** Maximum lifetime for a single client (in seconds). */
  maxLifetimeSeconds?: number
  /** When true, idle clients and timers are unref'd so the process can exit. */
  allowExitOnIdle?: boolean
  /** Time in ms a client may sit idle in the pool before being closed. */
  idleTimeoutMillis?: number
  /** Time in ms to wait for a client to connect before erroring. */
  connectionTimeoutMillis?: number
  /** Override Promise implementation used by promise-returning APIs. */
  Promise?: PromiseConstructorLike
  /** Override the Client constructor used to create new clients. */
  Client?: ClientConstructor
  /** Logger function called with diagnostic messages from the pool. */
  log?: LogFn
  /** Hook called once after each new client successfully connects. */
  onConnect?: OnConnectHook
  /** Verify a freshly-connected client before returning it to the consumer. */
  verify?: VerifyCallback
}

export interface PoolClient extends Client {
  release: ReleaseCallback
  _poolUseCount?: number
  // Internal pg client fields the pool reaches into.
  _queryable?: boolean
  _ending?: boolean
  connection?: { stream: { destroy: () => void } } & Record<string, unknown>
  isConnected?: () => boolean
  // Callback-style overloads of connect/end we rely on from the legacy pg client.
  connect: ((cb: (err?: Error) => void) => void) & (() => Promise<void>)
  end: ((cb?: () => void) => void) & (() => Promise<void>)
}

class IdleItem {
  client: PoolClient
  idleListener: (err: Error) => void
  timeoutId: ReturnType<typeof setTimeout> | undefined

  constructor(
    client: PoolClient,
    idleListener: (err: Error) => void,
    timeoutId: ReturnType<typeof setTimeout> | undefined
  ) {
    this.client = client
    this.idleListener = idleListener
    this.timeoutId = timeoutId
  }
}

type PendingItemCallback<C extends PoolClient = PoolClient> = (
  err: Error | undefined,
  client?: C,
  release?: ReleaseCallback
) => void

class PendingItem<C extends PoolClient = PoolClient> {
  callback: PendingItemCallback<C>
  timedOut?: boolean

  constructor(callback: PendingItemCallback<C>) {
    this.callback = callback
  }
}

function throwOnDoubleRelease(): never {
  throw new Error('Release called on client which has already been released to the pool.')
}

interface PromisifiedResult<T> {
  callback: (err: Error | undefined, value?: T, release?: ReleaseCallback) => void
  result: Promise<T> | undefined
}

function promisify<T>(
  Promise: PromiseConstructorLike,
  callback?: (err: Error | undefined, value?: T, release?: ReleaseCallback) => void
): PromisifiedResult<T> {
  if (callback) {
    return { callback: callback, result: undefined }
  }
  let rej: (reason?: unknown) => void
  let res: (value: T) => void
  const cb = function (err: Error | undefined, client?: T): void {
    err ? rej(err) : res(client as T)
  }
  const result = new (Promise as PromiseConstructor)<T>(function (resolve, reject) {
    res = resolve
    rej = reject
  }).catch((err: Error) => {
    // replace the stack trace that leads to `TCP.onStreamRead` with one that leads back to the
    // application that created the query
    Error.captureStackTrace(err)
    throw err
  })
  return { callback: cb, result: result }
}

function makeIdleListener(pool: Pool, client: PoolClient): (err: Error) => void {
  return function idleListener(err: Error): void {
    ;(err as Error & { client?: PoolClient }).client = client

    client.removeListener('error', idleListener)
    client.on('error', () => {
      pool.log('additional client error after disconnection due to error', err)
    })
    pool._remove(client)
    // TODO - document that once the pool emits an error
    // the client has already been closed & purged and is unusable
    pool.emit('error', err, client)
  }
}

class Pool extends EventEmitter {
  options: PoolOptions
  log: LogFn
  Client: ClientConstructor
  Promise: PromiseConstructorLike

  _clients: PoolClient[]
  _idle: IdleItem[]
  _expired: WeakSet<PoolClient>
  _pendingQueue: PendingItem[]
  _endCallback: ((err?: Error) => void) | undefined
  ending: boolean
  ended: boolean

  constructor(options?: PoolOptions | null, Client?: ClientConstructor) {
    super()
    this.options = Object.assign({}, options) as PoolOptions

    if (options != null && 'password' in options) {
      // "hiding" the password so it doesn't show up in stack traces
      // or if the client is console.logged
      Object.defineProperty(this.options, 'password', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: options.password,
      })
    }
    if (options != null && options.ssl && typeof options.ssl === 'object' && (options.ssl as { key?: unknown }).key) {
      // "hiding" the ssl->key so it doesn't show up in stack traces
      // or if the client is console.logged
      Object.defineProperty(this.options.ssl as object, 'key', {
        enumerable: false,
      })
    }

    this.options.max = this.options.max || this.options.poolSize || 10
    this.options.min = this.options.min || 0
    this.options.maxUses = this.options.maxUses || Infinity
    this.options.allowExitOnIdle = this.options.allowExitOnIdle || false
    this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0
    this.log = this.options.log || function () {}
    this.Client = this.options.Client || Client || (require('pg') as { Client: ClientConstructor }).Client
    this.Promise = this.options.Promise || globalThis.Promise

    if (typeof this.options.idleTimeoutMillis === 'undefined') {
      this.options.idleTimeoutMillis = 10000
    }

    this._clients = []
    this._idle = []
    this._expired = new WeakSet()
    this._pendingQueue = []
    this._endCallback = undefined
    this.ending = false
    this.ended = false
  }

  _promiseTry<T>(f: () => T | Promise<T>): Promise<T> {
    const Promise = this.Promise as PromiseConstructor & { try?: (fn: () => T | Promise<T>) => Promise<T> }
    if (typeof Promise.try === 'function') {
      return Promise.try(f)
    }
    return new Promise<T>((resolve) => resolve(f()))
  }

  _isFull(): boolean {
    return this._clients.length >= (this.options.max as number)
  }

  _isAboveMin(): boolean {
    return this._clients.length > (this.options.min as number)
  }

  _pulseQueue(): void {
    this.log('pulse queue')
    if (this.ended) {
      this.log('pulse queue ended')
      return
    }
    if (this.ending) {
      this.log('pulse queue on ending')
      if (this._idle.length) {
        this._idle.slice().map((item) => {
          this._remove(item.client)
        })
      }
      if (!this._clients.length) {
        this.ended = true
        this._endCallback!()
      }
      return
    }

    // if we don't have any waiting, do nothing
    if (!this._pendingQueue.length) {
      this.log('no queued requests')
      return
    }
    // if we don't have any idle clients and we have no more room do nothing
    if (!this._idle.length && this._isFull()) {
      return
    }
    const pendingItem = this._pendingQueue.shift()!
    if (this._idle.length) {
      const idleItem = this._idle.pop()!
      clearTimeout(idleItem.timeoutId)
      const client = idleItem.client
      ;(client as PoolClient & { ref?: () => void }).ref?.()
      const idleListener = idleItem.idleListener

      return this._acquireClient(client, pendingItem, idleListener, false)
    }
    if (!this._isFull()) {
      return this.newClient(pendingItem)
    }
    throw new Error('unexpected condition')
  }

  _remove(client: PoolClient, callback?: () => void): void {
    const removed = removeWhere(this._idle, (item) => item.client === client)

    if (removed !== undefined) {
      clearTimeout(removed.timeoutId)
    }

    this._clients = this._clients.filter((c) => c !== client)
    client.end(() => {
      this.emit('remove', client)

      if (typeof callback === 'function') {
        callback()
      }
    })
  }

  connect(): Promise<PoolClient>
  connect(cb: ConnectCallback): void
  connect(cb?: ConnectCallback): Promise<PoolClient> | void {
    if (this.ending) {
      const err = new Error('Cannot use a pool after calling end on the pool')
      return cb ? cb(err, undefined, NOOP) : (this.Promise as PromiseConstructor).reject(err)
    }

    const response = promisify<PoolClient>(this.Promise, cb as PendingItemCallback<PoolClient> | undefined)
    const result = response.result

    // if we don't have to connect a new client, don't do so
    if (this._isFull() || this._idle.length) {
      // if we have idle clients schedule a pulse immediately
      if (this._idle.length) {
        process.nextTick(() => this._pulseQueue())
      }

      if (!this.options.connectionTimeoutMillis) {
        this._pendingQueue.push(new PendingItem(response.callback as PendingItemCallback))
        return result
      }

      const queueCallback: PendingItemCallback = (err, res, done) => {
        clearTimeout(tid)
        response.callback(err, res, done)
      }

      const pendingItem = new PendingItem(queueCallback)

      // set connection timeout on checking out an existing client
      const tid = setTimeout(() => {
        // remove the callback from pending waiters because
        // we're going to call it with a timeout error
        removeWhere(this._pendingQueue, (i) => i.callback === queueCallback)
        pendingItem.timedOut = true
        response.callback(new Error('timeout exceeded when trying to connect'))
      }, this.options.connectionTimeoutMillis)

      if ((tid as { unref?: () => void }).unref) {
        ;(tid as unknown as { unref: () => void }).unref()
      }

      this._pendingQueue.push(pendingItem)
      return result
    }

    this.newClient(new PendingItem(response.callback as PendingItemCallback))

    return result
  }

  newClient(pendingItem: PendingItem): void {
    const client = new this.Client(this.options) as PoolClient
    this._clients.push(client)
    const idleListener = makeIdleListener(this, client)

    this.log('checking client timeout')

    // connection timeout logic
    let tid: ReturnType<typeof setTimeout> | undefined
    let timeoutHit = false
    if (this.options.connectionTimeoutMillis) {
      tid = setTimeout(() => {
        if (client.connection) {
          this.log('ending client due to timeout')
          timeoutHit = true
          client.connection.stream.destroy()
        } else if (client.isConnected && !client.isConnected()) {
          this.log('ending client due to timeout')
          timeoutHit = true
          // force kill the node driver, and let libpq do its teardown
          client.end()
        }
      }, this.options.connectionTimeoutMillis)
    }

    this.log('connecting new client')
    client.connect((err?: Error) => {
      if (tid) {
        clearTimeout(tid)
      }
      client.on('error', idleListener)
      if (err) {
        this.log('client failed to connect', err)
        // remove the dead client from our list of clients
        this._clients = this._clients.filter((c) => c !== client)
        if (timeoutHit) {
          err = new Error('Connection terminated due to connection timeout', { cause: err })
        }

        // this client won't be released, so move on immediately
        this._pulseQueue()

        if (!pendingItem.timedOut) {
          pendingItem.callback(err, undefined, NOOP)
        }
      } else {
        this.log('new client connected')

        if (this.options.onConnect) {
          this._promiseTry(() => this.options.onConnect!(client)).then(
            () => {
              this._afterConnect(client, pendingItem, idleListener)
            },
            (hookErr: Error) => {
              this._clients = this._clients.filter((c) => c !== client)
              client.end(() => {
                this._pulseQueue()
                if (!pendingItem.timedOut) {
                  pendingItem.callback(hookErr, undefined, NOOP)
                }
              })
            }
          )
          return
        }

        return this._afterConnect(client, pendingItem, idleListener)
      }
    })
  }

  _afterConnect(client: PoolClient, pendingItem: PendingItem, idleListener: (err: Error) => void): void {
    if (this.options.maxLifetimeSeconds !== 0) {
      const maxLifetimeTimeout = setTimeout(
        () => {
          this.log('ending client due to expired lifetime')
          this._expired.add(client)
          const idleIndex = this._idle.findIndex((idleItem) => idleItem.client === client)
          if (idleIndex !== -1) {
            this._acquireClient(
              client,
              new PendingItem((_err, _client, clientRelease) => clientRelease!()),
              idleListener,
              false
            )
          }
        },
        (this.options.maxLifetimeSeconds as number) * 1000
      )

      maxLifetimeTimeout.unref()
      client.once('end', () => clearTimeout(maxLifetimeTimeout))
    }

    return this._acquireClient(client, pendingItem, idleListener, true)
  }

  // acquire a client for a pending work item
  _acquireClient(
    client: PoolClient,
    pendingItem: PendingItem,
    idleListener: (err: Error) => void,
    isNew: boolean
  ): void {
    if (isNew) {
      this.emit('connect', client)
    }

    this.emit('acquire', client)

    client.release = this._releaseOnce(client, idleListener)

    client.removeListener('error', idleListener)

    if (!pendingItem.timedOut) {
      if (isNew && this.options.verify) {
        this.options.verify(client, (err) => {
          if (err) {
            client.release(err)
            return pendingItem.callback(err, undefined, NOOP)
          }

          pendingItem.callback(undefined, client, client.release)
        })
      } else {
        pendingItem.callback(undefined, client, client.release)
      }
    } else {
      if (isNew && this.options.verify) {
        this.options.verify(client, client.release)
      } else {
        client.release()
      }
    }
  }

  // returns a function that wraps _release and throws if called more than once
  _releaseOnce(client: PoolClient, idleListener: (err: Error) => void): ReleaseCallback {
    let released = false

    return (err) => {
      if (released) {
        throwOnDoubleRelease()
      }

      released = true
      this._release(client, idleListener, err)
    }
  }

  // release a client back to the poll, include an error
  // to remove it from the pool
  _release(client: PoolClient, idleListener: (err: Error) => void, err?: Error | boolean): void {
    client.on('error', idleListener)

    client._poolUseCount = (client._poolUseCount || 0) + 1

    this.emit('release', err, client)

    // TODO(bmc): expose a proper, public interface _queryable and _ending
    if (
      err ||
      this.ending ||
      !client._queryable ||
      client._ending ||
      client._poolUseCount >= (this.options.maxUses as number)
    ) {
      if (client._poolUseCount >= (this.options.maxUses as number)) {
        this.log('remove expended client')
      }

      return this._remove(client, this._pulseQueue.bind(this))
    }

    const isExpired = this._expired.has(client)
    if (isExpired) {
      this.log('remove expired client')
      this._expired.delete(client)
      return this._remove(client, this._pulseQueue.bind(this))
    }

    // idle timeout
    let tid: ReturnType<typeof setTimeout> | undefined
    if (this.options.idleTimeoutMillis && this._isAboveMin()) {
      tid = setTimeout(() => {
        if (this._isAboveMin()) {
          this.log('remove idle client')
          this._remove(client, this._pulseQueue.bind(this))
        }
      }, this.options.idleTimeoutMillis)

      if (this.options.allowExitOnIdle) {
        // allow Node to exit if this is all that's left
        tid.unref()
      }
    }

    if (this.options.allowExitOnIdle) {
      ;(client as PoolClient & { unref?: () => void }).unref?.()
    }

    this._idle.push(new IdleItem(client, idleListener, tid))
    this._pulseQueue()
  }

  query<R extends QueryResultRow = any, I extends any[] = any[]>(queryStream: Submittable): Submittable
  query<R extends any[] = any[], I extends any[] = any[]>(
    queryConfig: QueryArrayConfig<I>,
    values?: I
  ): Promise<QueryArrayResult<R>>
  query<R extends QueryResultRow = any, I extends any[] = any[]>(queryConfig: QueryConfig<I>): Promise<QueryResult<R>>
  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: I
  ): Promise<QueryResult<R>>
  query<R extends any[] = any[], I extends any[] = any[]>(
    queryConfig: QueryArrayConfig<I>,
    callback: (err: Error, result: QueryArrayResult<R>) => void
  ): void
  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    callback: (err: Error, result: QueryResult<R>) => void
  ): void
  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryText: string,
    values: I,
    callback: (err: Error, result: QueryResult<R>) => void
  ): void
  query(
    text: unknown,
    values?: unknown,
    cb?: (err: Error | undefined, result?: unknown) => void
  ): Promise<unknown> | undefined {
    // guard clause against passing a function as the first parameter
    if (typeof text === 'function') {
      const response = promisify<unknown>(this.Promise, text as (err: Error | undefined) => void)
      setImmediate(function () {
        return response.callback(new Error('Passing a function as the first parameter to pool.query is not supported'))
      })
      return response.result
    }

    // allow plain text query without values
    if (typeof values === 'function') {
      cb = values as (err: Error | undefined, result?: unknown) => void
      values = undefined
    }
    const response = promisify<unknown>(this.Promise, cb)
    cb = response.callback as (err: Error | undefined, result?: unknown) => void

    this.connect((err, client) => {
      if (err) {
        return cb!(err)
      }

      let clientReleased = false
      const onError = (err: Error): void => {
        if (clientReleased) {
          return
        }
        clientReleased = true
        client!.release(err)
        cb!(err)
      }

      client!.once('error', onError)
      this.log('dispatching query')
      try {
        ;(
          client as PoolClient & {
            query: (text: unknown, values: unknown, cb: (err: Error | undefined, res?: unknown) => void) => void
          }
        ).query(text, values, (err, res) => {
          this.log('query dispatched')
          client!.removeListener('error', onError)
          if (clientReleased) {
            return
          }
          clientReleased = true
          client!.release(err)
          if (err) {
            return cb!(err)
          }
          return cb!(undefined, res)
        })
      } catch (err) {
        client!.release(err as Error)
        return cb!(err as Error)
      }
    })
    return response.result
  }

  end(): Promise<void>
  end(cb: (err?: Error) => void): void
  end(cb?: (err?: Error) => void): Promise<void> | void {
    this.log('ending')
    if (this.ending) {
      const err = new Error('Called end on pool more than once')
      return cb ? cb(err) : (this.Promise as PromiseConstructor).reject(err)
    }
    this.ending = true
    const promised = promisify<void>(this.Promise, cb)
    this._endCallback = promised.callback as (err?: Error) => void
    this._pulseQueue()
    return promised.result
  }

  get waitingCount(): number {
    return this._pendingQueue.length
  }

  get idleCount(): number {
    return this._idle.length
  }

  get expiredCount(): number {
    return this._clients.reduce((acc, client) => acc + (this._expired.has(client) ? 1 : 0), 0)
  }

  get totalCount(): number {
    return this._clients.length
  }
}

export { Pool }
export default Pool
