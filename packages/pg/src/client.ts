import { EventEmitter } from 'node:events'
import { deprecate } from 'node:util'

import Connection from './connection.ts'
import ConnectionParameters from './connection-parameters.ts'
import * as crypto from './crypto/utils.ts'
import sasl from './crypto/sasl.ts'
import defaults from './defaults.ts'
import Query from './query.ts'
import TypeOverrides from './type-overrides.ts'
import { escapeIdentifier as utilsEscapeIdentifier, escapeLiteral as utilsEscapeLiteral } from './utils.ts'

import type { ConnectionParametersConfig } from './connection-parameters.ts'
import type { SASLSession } from './crypto/sasl.ts'
import type { QueryConfigInput } from './utils.ts'

const activeQueryDeprecationNotice = deprecate(
  () => {},
  'Client.activeQuery is deprecated and will be removed in pg@9.0'
)

const queryQueueDeprecationNotice = deprecate(
  () => {},
  'Client.queryQueue is deprecated and will be removed in pg@9.0.'
)

const pgPassDeprecationNotice = deprecate(
  () => {},
  'pgpass support is deprecated and will be removed in pg@9.0. ' +
    'You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. Within this function you can call the pgpass module in your own code.'
)

const byoPromiseDeprecationNotice = deprecate(
  () => {},
  'Passing a custom Promise implementation to the Client/Pool constructor is deprecated and will be removed in pg@9.0.'
)

const queryQueueLengthDeprecationNotice = deprecate(
  () => {},
  'Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.'
)

export interface ClientConfig extends ConnectionParametersConfig {
  Promise?: PromiseConstructorLike
  types?: unknown
  connection?: Connection
  stream?: unknown
  binary?: boolean
  enableChannelBinding?: boolean
  connectionTimeoutMillis?: number
  password?: string | null | ((connectionParameters: ConnectionParameters) => string | Promise<string>)
}

type ConnectCallback = (err?: Error, client?: Client) => void
type QueryCallback = (err?: Error, result?: any) => void

class Client extends EventEmitter {
  static Query: typeof Query = Query

  connectionParameters: ConnectionParameters
  user: string | undefined
  database: string | undefined
  port: number
  host: string
  password: string | null | ((connectionParameters: ConnectionParameters) => string | Promise<string>) | undefined
  replication: string | boolean | undefined

  _Promise: PromiseConstructorLike
  _types: TypeOverrides
  _ending: boolean
  _ended: boolean
  _connecting: boolean
  _connected: boolean
  _connectionError: boolean
  _queryable: boolean
  _activeQuery: Query | null

  enableChannelBinding: boolean
  connection: Connection
  _queryQueue: Query[]
  binary: boolean
  processID: number | null
  secretKey: number | null
  ssl: boolean | Record<string, unknown>
  _connectionTimeoutMillis: number

  connectionTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  _connectionCallback: ConnectCallback | null | undefined
  saslSession: SASLSession | null = null
  readyForQuery?: boolean
  hasExecuted?: boolean

  constructor(config?: string | ClientConfig) {
    super()

    const c: ClientConfig = typeof config === 'string' ? ({ connectionString: config } as ClientConfig) : config || {}

    this.connectionParameters = new ConnectionParameters(c)
    this.user = this.connectionParameters.user
    this.database = this.connectionParameters.database
    this.port = this.connectionParameters.port
    this.host = this.connectionParameters.host

    // "hiding" the password so it doesn't show up in stack traces or if the client is console.logged
    Object.defineProperty(this, 'password', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: this.connectionParameters.password,
    })

    this.replication = this.connectionParameters.replication

    if (c.Promise) {
      byoPromiseDeprecationNotice()
    }
    this._Promise = c.Promise || (globalThis.Promise as unknown as PromiseConstructorLike)
    this._types = new TypeOverrides(c.types as never)
    this._ending = false
    this._ended = false
    this._connecting = false
    this._connected = false
    this._connectionError = false
    this._queryable = true
    this._activeQuery = null

    this.enableChannelBinding = Boolean(c.enableChannelBinding) // set true to use SCRAM-SHA-256-PLUS when offered
    this.connection =
      c.connection ||
      new Connection({
        stream: c.stream as never,
        ssl: this.connectionParameters.ssl as boolean | Record<string, unknown>,
        keepAlive: c.keepAlive || false,
        keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
        encoding: this.connectionParameters.client_encoding || 'utf8',
      })
    this._queryQueue = []
    this.binary = c.binary || defaults.binary
    this.processID = null
    this.secretKey = null
    this.ssl = (this.connectionParameters.ssl as boolean | Record<string, unknown>) || false
    // As with Password, make SSL->Key (the private key) non-enumerable.
    if (this.ssl && typeof this.ssl === 'object' && 'key' in this.ssl) {
      Object.defineProperty(this.ssl, 'key', {
        enumerable: false,
      })
    }

    this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0
  }

  get activeQuery(): Query | null {
    activeQueryDeprecationNotice()
    return this._activeQuery
  }

  set activeQuery(val: Query | null) {
    activeQueryDeprecationNotice()
    this._activeQuery = val
  }

  _getActiveQuery(): Query | null {
    return this._activeQuery
  }

  _errorAllQueries(err: Error): void {
    const enqueueError = (query: Query) => {
      process.nextTick(() => {
        query.handleError(err, this.connection as never)
      })
    }

    const activeQuery = this._getActiveQuery()
    if (activeQuery) {
      enqueueError(activeQuery)
      this._activeQuery = null
    }

    this._queryQueue.forEach(enqueueError)
    this._queryQueue.length = 0
  }

  _connect(callback: ConnectCallback): void {
    const con = this.connection
    this._connectionCallback = callback

    if (this._connecting || this._connected) {
      const err = new Error('Client has already been connected. You cannot reuse a client.')
      process.nextTick(() => {
        callback(err)
      })
      return
    }
    this._connecting = true

    if (this._connectionTimeoutMillis > 0) {
      this.connectionTimeoutHandle = setTimeout(() => {
        ;(con as unknown as { _ending: boolean })._ending = true
        ;(con.stream as unknown as { destroy(err: Error): void }).destroy(new Error('timeout expired'))
      }, this._connectionTimeoutMillis)

      if ((this.connectionTimeoutHandle as unknown as { unref?: () => void }).unref) {
        ;(this.connectionTimeoutHandle as unknown as { unref(): void }).unref()
      }
    }

    if (this.host && this.host.indexOf('/') === 0) {
      con.connect(this.host + '/.s.PGSQL.' + this.port)
    } else {
      con.connect(this.port, this.host)
    }

    // once connection is established send startup message
    con.on('connect', () => {
      if (this.ssl) {
        con.requestSsl()
      } else {
        con.startup(this.getStartupConf())
      }
    })

    con.on('sslconnect', () => {
      con.startup(this.getStartupConf())
    })

    this._attachListeners(con)

    con.once('end', () => {
      const error = this._ending ? new Error('Connection terminated') : new Error('Connection terminated unexpectedly')

      clearTimeout(this.connectionTimeoutHandle)
      this._errorAllQueries(error)
      this._ended = true

      if (!this._ending) {
        // if the connection is ended without us calling .end() on this client then we have an
        // unexpected disconnection; treat this as an error unless we've already emitted an error
        // during connection.
        if (this._connecting && !this._connectionError) {
          if (this._connectionCallback) {
            this._connectionCallback(error)
          } else {
            this._handleErrorEvent(error)
          }
        } else if (!this._connectionError) {
          this._handleErrorEvent(error)
        }
      }

      process.nextTick(() => {
        this.emit('end')
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

  _attachListeners(con: Connection): void {
    con.on('authenticationCleartextPassword', this._handleAuthCleartextPassword.bind(this))
    con.on('authenticationMD5Password', this._handleAuthMD5Password.bind(this))
    con.on('authenticationSASL', this._handleAuthSASL.bind(this))
    con.on('authenticationSASLContinue', this._handleAuthSASLContinue.bind(this))
    con.on('authenticationSASLFinal', this._handleAuthSASLFinal.bind(this))
    con.on('backendKeyData', this._handleBackendKeyData.bind(this))
    con.on('error', this._handleErrorEvent.bind(this))
    con.on('errorMessage', this._handleErrorMessage.bind(this))
    con.on('readyForQuery', this._handleReadyForQuery.bind(this))
    con.on('notice', this._handleNotice.bind(this))
    con.on('rowDescription', this._handleRowDescription.bind(this))
    con.on('dataRow', this._handleDataRow.bind(this))
    con.on('portalSuspended', this._handlePortalSuspended.bind(this))
    con.on('emptyQuery', this._handleEmptyQuery.bind(this))
    con.on('commandComplete', this._handleCommandComplete.bind(this))
    con.on('parseComplete', this._handleParseComplete.bind(this))
    con.on('copyInResponse', this._handleCopyInResponse.bind(this))
    con.on('copyData', this._handleCopyData.bind(this))
    con.on('notification', this._handleNotification.bind(this))
  }

  _getPassword(cb: () => void): void {
    const con = this.connection
    if (typeof this.password === 'function') {
      ;(this._Promise as PromiseConstructor)
        .resolve()
        .then(() =>
          (this.password as (cp: ConnectionParameters) => string | Promise<string>)(this.connectionParameters)
        )
        .then((pass) => {
          if (pass !== undefined) {
            if (typeof pass !== 'string') {
              con.emit('error', new TypeError('Password must be a string'))
              return
            }
            this.connectionParameters.password = this.password = pass
          } else {
            this.connectionParameters.password = this.password = null
          }
          cb()
        })
        .catch((err: Error) => {
          con.emit('error', err)
        })
    } else if (this.password !== null) {
      cb()
    } else {
      // pgpass is deprecated; we attempt a dynamic require so that environments without it
      // still load the client cleanly.
      ;(async () => {
        try {
          const mod = (await import('pgpass')) as unknown as {
            default: (cfg: unknown, cb: (pass: string | undefined) => void) => void
          }
          mod.default(this.connectionParameters, (pass) => {
            if (undefined !== pass) {
              pgPassDeprecationNotice()
              this.connectionParameters.password = this.password = pass
            }
            cb()
          })
        } catch (e) {
          this.emit('error', e)
        }
      })()
    }
  }

  _handleAuthCleartextPassword(_msg: unknown): void {
    this._getPassword(() => {
      this.connection.password(this.password as string)
    })
  }

  _handleAuthMD5Password(msg: { salt: Buffer }): void {
    this._getPassword(async () => {
      try {
        const hashedPassword = await crypto.postgresMd5PasswordHash(this.user!, this.password as string, msg.salt)
        this.connection.password(hashedPassword)
      } catch (e) {
        this.emit('error', e)
      }
    })
  }

  _handleAuthSASL(msg: { mechanisms: string[] }): void {
    this._getPassword(() => {
      try {
        this.saslSession = sasl.startSession(
          msg.mechanisms,
          this.enableChannelBinding &&
            (this.connection.stream as unknown as { getPeerCertificate?: () => { raw: Buffer } })
        )
        this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response)
      } catch (err) {
        this.connection.emit('error', err)
      }
    })
  }

  async _handleAuthSASLContinue(msg: { data: string }): Promise<void> {
    try {
      await sasl.continueSession(
        this.saslSession!,
        this.password as string,
        msg.data,
        this.enableChannelBinding &&
          (this.connection.stream as unknown as { getPeerCertificate?: () => { raw: Buffer } })
      )
      this.connection.sendSCRAMClientFinalMessage(this.saslSession!.response)
    } catch (err) {
      this.connection.emit('error', err)
    }
  }

  _handleAuthSASLFinal(msg: { data: string }): void {
    try {
      sasl.finalizeSession(this.saslSession!, msg.data)
      this.saslSession = null
    } catch (err) {
      this.connection.emit('error', err)
    }
  }

  _handleBackendKeyData(msg: { processID: number; secretKey: number }): void {
    this.processID = msg.processID
    this.secretKey = msg.secretKey
  }

  _handleReadyForQuery(_msg: unknown): void {
    if (this._connecting) {
      this._connecting = false
      this._connected = true
      clearTimeout(this.connectionTimeoutHandle)

      // process possible callback argument to Client#connect
      if (this._connectionCallback) {
        this._connectionCallback(null as never, this)
        // remove callback for proper error handling after the connect event
        this._connectionCallback = null
      }
      this.emit('connect')
    }
    const activeQuery = this._getActiveQuery()
    this._activeQuery = null
    this.readyForQuery = true
    if (activeQuery) {
      activeQuery.handleReadyForQuery(this.connection as never)
    }
    this._pulseQueryQueue()
  }

  // if we receive an error event or error message during the connection process we handle it here
  _handleErrorWhileConnecting(err: Error): void {
    if (this._connectionError) {
      // TODO(bmc): this is swallowing errors - we shouldn't do this
      return
    }
    this._connectionError = true
    clearTimeout(this.connectionTimeoutHandle)
    if (this._connectionCallback) {
      this._connectionCallback(err)
      return
    }
    this.emit('error', err)
  }

  // if we're connected and we receive an error event from the connection this means the
  // socket is dead - do a hard abort of all queries and emit the socket error on the client too
  _handleErrorEvent(err: Error): void {
    if (this._connecting) {
      this._handleErrorWhileConnecting(err)
      return
    }
    this._queryable = false
    this._errorAllQueries(err)
    this.emit('error', err)
  }

  _handleErrorMessage(msg: Error): void {
    if (this._connecting) {
      this._handleErrorWhileConnecting(msg)
      return
    }
    const activeQuery = this._getActiveQuery()

    if (!activeQuery) {
      this._handleErrorEvent(msg)
      return
    }

    this._activeQuery = null
    activeQuery.handleError(msg, this.connection as never)
  }

  _handleRowDescription(msg: { fields: Parameters<Query['handleRowDescription']>[0]['fields'] }): void {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected rowDescription message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleRowDescription(msg)
  }

  _handleDataRow(msg: { fields: Array<string | Buffer | null> }): void {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected dataRow message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleDataRow(msg)
  }

  _handlePortalSuspended(_msg: unknown): void {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected portalSuspended message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handlePortalSuspended(this.connection as never)
  }

  _handleEmptyQuery(_msg: unknown): void {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected emptyQuery message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleEmptyQuery(this.connection as never)
  }

  _handleCommandComplete(msg: { text?: string; command?: string }): void {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected commandComplete message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleCommandComplete(msg, this.connection as never)
  }

  _handleParseComplete(): void {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected parseComplete message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // if a prepared statement has a name and properly parses we track that it's already
    // been executed so we don't parse it again on the same client
    if (activeQuery.name) {
      this.connection.parsedStatements[activeQuery.name] = activeQuery.text
    }
  }

  _handleCopyInResponse(_msg: unknown): void {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected copyInResponse message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleCopyInResponse(this.connection as never)
  }

  _handleCopyData(msg: unknown): void {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected copyData message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleCopyData(msg, this.connection as never)
  }

  _handleNotification(msg: unknown): void {
    this.emit('notification', msg)
  }

  _handleNotice(msg: unknown): void {
    this.emit('notice', msg)
  }

  getStartupConf(): Record<string, string> {
    const params = this.connectionParameters

    const data: Record<string, string> = {
      user: params.user || '',
      database: params.database || '',
    }

    const appName = params.application_name || params.fallback_application_name
    if (appName) {
      data.application_name = appName
    }
    if (params.replication) {
      data.replication = '' + params.replication
    }
    if (params.statement_timeout) {
      data.statement_timeout = String(parseInt(String(params.statement_timeout), 10))
    }
    if (params.lock_timeout) {
      data.lock_timeout = String(parseInt(String(params.lock_timeout), 10))
    }
    if (params.idle_in_transaction_session_timeout) {
      data.idle_in_transaction_session_timeout = String(
        parseInt(String(params.idle_in_transaction_session_timeout), 10)
      )
    }
    if (params.options) {
      data.options = params.options
    }

    return data
  }

  cancel(client: Client, query: Query): void {
    if (client.activeQuery === query) {
      const con = this.connection

      if (this.host && this.host.indexOf('/') === 0) {
        con.connect(this.host + '/.s.PGSQL.' + this.port)
      } else {
        con.connect(this.port, this.host)
      }

      // once connection is established send cancel message
      con.on('connect', () => {
        con.cancel(client.processID!, client.secretKey!)
      })
    } else if (client._queryQueue.indexOf(query) !== -1) {
      client._queryQueue.splice(client._queryQueue.indexOf(query), 1)
    }
  }

  setTypeParser(oid: number, format: never, parseFn?: never): void {
    return this._types.setTypeParser(oid, format, parseFn)
  }

  getTypeParser(oid: number, format?: never): unknown {
    return this._types.getTypeParser(oid, format)
  }

  // escapeIdentifier and escapeLiteral moved to utility functions & exported on PG;
  // re-exported here for backwards compatibility
  escapeIdentifier(str: string): string {
    return utilsEscapeIdentifier(str)
  }

  escapeLiteral(str: unknown): string {
    return utilsEscapeLiteral(str)
  }

  _pulseQueryQueue(): void {
    if (this.readyForQuery === true) {
      const next = this._queryQueue.shift()
      this._activeQuery = next || null
      const activeQuery = this._getActiveQuery()
      if (activeQuery) {
        this.readyForQuery = false
        this.hasExecuted = true

        const queryError = activeQuery.submit(this.connection as never)
        if (queryError) {
          process.nextTick(() => {
            activeQuery.handleError(queryError, this.connection as never)
            this.readyForQuery = true
            this._pulseQueryQueue()
          })
        }
      } else if (this.hasExecuted) {
        this._activeQuery = null
        this.emit('drain')
      }
    }
  }

  // Submittable overloads come first so a `Query`/`Cursor` instance is matched
  // and the return type carries through (instead of being eaten by a wider
  // `QueryConfigInput` overload).
  query<S extends { submit(connection: unknown): void }>(query: S): S
  query<S extends { submit(connection: unknown): void }>(query: S, callback: QueryCallback): S
  query<R = any>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: R[]; rowCount: number | null; command: string | null; oid: number | null; fields: unknown[] }>
  query<_R = any>(text: string, callback: QueryCallback): void
  query<_R = any>(text: string, values: unknown[], callback: QueryCallback): void
  query<R = any>(
    config: QueryConfigInput,
    values?: unknown[]
  ): Promise<{ rows: R[]; rowCount: number | null; command: string | null; oid: number | null; fields: unknown[] }>
  query<_R = any>(config: QueryConfigInput, callback: QueryCallback): void
  query<_R = any>(config: QueryConfigInput, values: unknown[], callback: QueryCallback): void
  query(
    config: string | QueryConfigInput | Query | { submit(connection: unknown): void },
    values?: unknown[] | QueryCallback,
    callback?: QueryCallback
  ): unknown {
    let query: Query
    let result: unknown
    let readTimeout: number | false | undefined
    let readTimeoutTimer: ReturnType<typeof setTimeout> | undefined
    let queryCallback: QueryCallback | undefined

    if (config === null || config === undefined) {
      throw new TypeError('Client was passed a null or undefined query')
    } else if (typeof (config as Query).submit === 'function') {
      readTimeout = (config as QueryConfigInput).query_timeout || this.connectionParameters.query_timeout
      result = query = config as Query
      if (!query.callback) {
        if (typeof values === 'function') {
          query.callback = values as QueryCallback
        } else if (callback) {
          query.callback = callback
        }
      }
    } else {
      readTimeout = (config as QueryConfigInput).query_timeout || this.connectionParameters.query_timeout
      query = new Query(config as string | QueryConfigInput, values as never, callback)
      if (!query.callback) {
        result = new (this._Promise as PromiseConstructor)((resolve, reject) => {
          query.callback = (err, res) => (err ? reject(err) : resolve(res))
        }).catch((err: Error) => {
          // replace the stack trace that leads to `TCP.onStreamRead` with one that leads
          // back to the application that created the query
          Error.captureStackTrace(err)
          throw err
        })
      }
    }

    if (readTimeout) {
      queryCallback = query.callback || (() => {})

      readTimeoutTimer = setTimeout(() => {
        const error = new Error('Query read timeout')

        process.nextTick(() => {
          query.handleError(error, this.connection as never)
        })

        queryCallback!(error)

        // we already returned an error, just do nothing if query completes
        query.callback = () => {}

        // Remove from queue
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

    if (this.binary && !query.binary) {
      query.binary = true
    }

    if (query._result && !query._result._types) {
      query._result._types = this._types
    }

    if (!this._queryable) {
      process.nextTick(() => {
        query.handleError(
          new Error('Client has encountered a connection error and is not queryable'),
          this.connection as never
        )
      })
      return result
    }

    if (this._ending) {
      process.nextTick(() => {
        query.handleError(new Error('Client was closed and is not queryable'), this.connection as never)
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

  ref(): void {
    this.connection.ref()
  }

  unref(): void {
    this.connection.unref()
  }

  end(): Promise<void>
  // Bivariant first so a callback like `(err) => ...` gets `err: any` and a
  // Promise-resolver-shaped value (`(value?: void | PromiseLike<void>) => void`)
  // is also accepted directly.
  end(cb: (...args: any[]) => any): void
  end(cb: () => void): void
  end(cb?: () => void): void | Promise<void> {
    this._ending = true

    // if we have never connected, then end is a noop, callback immediately
    if (!(this.connection as unknown as { _connecting?: boolean })._connecting || this._ended) {
      if (cb) {
        cb()
      } else {
        return (this._Promise as PromiseConstructor).resolve()
      }
    }

    if (this._getActiveQuery() || !this._queryable) {
      // if we have an active query we need to force a disconnect on the socket -
      // otherwise a hung query could block end forever
      ;(this.connection.stream as unknown as { destroy(): void }).destroy()
    } else {
      this.connection.end()
    }

    if (cb) {
      this.connection.once('end', cb)
      return
    }
    return new (this._Promise as PromiseConstructor)<void>((resolve) => {
      this.connection.once('end', resolve)
    })
  }

  get queryQueue(): Query[] {
    queryQueueDeprecationNotice()
    return this._queryQueue
  }
}

export default Client
export { Client }
