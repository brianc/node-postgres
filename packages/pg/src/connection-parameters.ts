import * as dns from 'node:dns'

import { parse } from 'pg-connection-string'

import defaults from './defaults.ts'

export interface ConnectionParametersConfig {
  user?: string
  database?: string
  port?: number | string
  host?: string
  password?: string | null | (() => string | Promise<string>)
  binary?: boolean
  options?: string
  ssl?: boolean | string | Record<string, unknown>
  client_encoding?: string
  replication?: string | boolean
  application_name?: string
  fallback_application_name?: string
  statement_timeout?: number | false
  lock_timeout?: number | false
  idle_in_transaction_session_timeout?: number | false
  query_timeout?: number | false
  connect_timeout?: number
  connectionString?: string
  connectionTimeoutMillis?: number
  keepAlive?: boolean
  keepAliveInitialDelayMillis?: number
  [key: string]: unknown
}

type LibpqCallback = (err: Error | null, connectionString: string | null) => void

function val(key: string, config: Record<string, unknown>, envVar?: string | false): unknown {
  if (config[key]) {
    return config[key]
  }

  let envValue: unknown
  if (envVar === undefined) {
    envValue = process.env['PG' + key.toUpperCase()]
  } else if (envVar === false) {
    // do nothing ... use false
  } else {
    envValue = process.env[envVar]
  }

  return envValue || (defaults as unknown as Record<string, unknown>)[key]
}

function readSSLConfigFromEnvironment(): boolean | { rejectUnauthorized: false } | object {
  switch (process.env.PGSSLMODE) {
    case 'disable':
      return false
    case 'prefer':
    case 'require':
    case 'verify-ca':
    case 'verify-full':
      return true
    case 'no-verify':
      return { rejectUnauthorized: false }
  }
  return defaults.ssl
}

// Convert arg to a string, surround in single quotes, and escape single quotes and backslashes
function quoteParamValue(value: unknown): string {
  return "'" + ('' + value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

function add(params: string[], config: Record<string, unknown>, paramName: string): void {
  const value = config[paramName]
  if (value !== undefined && value !== null) {
    params.push(paramName + '=' + quoteParamValue(value))
  }
}

class ConnectionParameters {
  user: string | undefined
  database: string | undefined
  port: number
  host: string
  password: string | null | ((connectionParameters: ConnectionParameters) => string | Promise<string>) | undefined
  binary: boolean | undefined
  options: string | undefined
  ssl: boolean | string | Record<string, unknown>
  client_encoding: string | undefined
  replication: string | boolean | undefined
  isDomainSocket: boolean
  application_name: string | undefined
  fallback_application_name: string | undefined
  statement_timeout: number | false | undefined
  lock_timeout: number | false | undefined
  idle_in_transaction_session_timeout: number | false | undefined
  query_timeout: number | false | undefined
  connect_timeout: number
  keepalives: number | undefined
  keepalives_idle: number | undefined
  nativeConnectionString?: string

  constructor(rawConfig?: string | ConnectionParametersConfig | null) {
    // if a string is passed, it is a raw connection string so we parse it into a config
    let config: Record<string, unknown> =
      typeof rawConfig === 'string'
        ? (parse(rawConfig) as unknown as Record<string, unknown>)
        : (rawConfig as Record<string, unknown>) || {}

    // if the config has a connectionString defined, parse IT into the config we use
    // this will override other default values with what is stored in connectionString
    if (config.connectionString) {
      config = Object.assign({}, config, parse(config.connectionString as string))
    }

    this.user = val('user', config) as string | undefined
    this.database = val('database', config) as string | undefined

    if (this.database === undefined) {
      this.database = this.user
    }

    this.port = parseInt(val('port', config) as string, 10)
    this.host = val('host', config) as string

    // "hiding" the password so it doesn't show up in stack traces
    // or if the client is console.logged
    Object.defineProperty(this, 'password', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: val('password', config),
    })

    this.binary = val('binary', config) as boolean | undefined
    this.options = val('options', config) as string | undefined

    this.ssl =
      typeof config.ssl === 'undefined'
        ? (readSSLConfigFromEnvironment() as boolean | object)
        : (config.ssl as boolean | string | Record<string, unknown>)

    if (typeof this.ssl === 'string') {
      if (this.ssl === 'true') {
        this.ssl = true
      }
    }
    // support passing in ssl=no-verify via connection string
    if (this.ssl === 'no-verify') {
      this.ssl = { rejectUnauthorized: false }
    }
    if (this.ssl && typeof this.ssl === 'object' && 'key' in this.ssl) {
      Object.defineProperty(this.ssl, 'key', {
        enumerable: false,
      })
    }

    this.client_encoding = val('client_encoding', config) as string | undefined
    this.replication = val('replication', config) as string | boolean | undefined
    // a domain socket begins with '/'
    this.isDomainSocket = !(this.host || '').indexOf('/')

    this.application_name = val('application_name', config, 'PGAPPNAME') as string | undefined
    this.fallback_application_name = val('fallback_application_name', config, false) as string | undefined
    this.statement_timeout = val('statement_timeout', config, false) as number | false | undefined
    this.lock_timeout = val('lock_timeout', config, false) as number | false | undefined
    this.idle_in_transaction_session_timeout = val('idle_in_transaction_session_timeout', config, false) as
      | number
      | false
      | undefined
    this.query_timeout = val('query_timeout', config, false) as number | false | undefined

    if (config.connectionTimeoutMillis === undefined) {
      this.connect_timeout = (process.env.PGCONNECT_TIMEOUT as unknown as number) || 0
    } else {
      this.connect_timeout = Math.floor((config.connectionTimeoutMillis as number) / 1000)
    }

    if (config.keepAlive === false) {
      this.keepalives = 0
    } else if (config.keepAlive === true) {
      this.keepalives = 1
    }

    if (typeof config.keepAliveInitialDelayMillis === 'number') {
      this.keepalives_idle = Math.floor(config.keepAliveInitialDelayMillis / 1000)
    }
  }

  getLibpqConnectionString(cb: LibpqCallback): void {
    const params: string[] = []
    add(params, this as unknown as Record<string, unknown>, 'user')
    add(params, this as unknown as Record<string, unknown>, 'password')
    add(params, this as unknown as Record<string, unknown>, 'port')
    add(params, this as unknown as Record<string, unknown>, 'application_name')
    add(params, this as unknown as Record<string, unknown>, 'fallback_application_name')
    add(params, this as unknown as Record<string, unknown>, 'connect_timeout')
    add(params, this as unknown as Record<string, unknown>, 'options')

    const ssl =
      typeof this.ssl === 'object' ? (this.ssl as Record<string, unknown>) : this.ssl ? { sslmode: this.ssl } : {}
    add(params, ssl, 'sslmode')
    add(params, ssl, 'sslca')
    add(params, ssl, 'sslkey')
    add(params, ssl, 'sslcert')
    add(params, ssl, 'sslrootcert')

    if (this.database) {
      params.push('dbname=' + quoteParamValue(this.database))
    }
    if (this.replication) {
      params.push('replication=' + quoteParamValue(this.replication))
    }
    if (this.host) {
      params.push('host=' + quoteParamValue(this.host))
    }
    if (this.isDomainSocket) {
      cb(null, params.join(' '))
      return
    }
    if (this.client_encoding) {
      params.push('client_encoding=' + quoteParamValue(this.client_encoding))
    }
    dns.lookup(this.host, (err, address) => {
      if (err) {
        cb(err, null)
        return
      }
      params.push('hostaddr=' + quoteParamValue(address))
      cb(null, params.join(' '))
    })
  }
}

export default ConnectionParameters
export { ConnectionParameters }
