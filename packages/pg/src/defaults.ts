import * as pgTypes from 'pg-types'

export interface Defaults {
  host: string
  user: string | undefined
  database: string | undefined
  password: string | null
  connectionString: string | undefined
  port: number
  rows: number
  binary: boolean
  max: number
  idleTimeoutMillis: number
  client_encoding: string
  ssl: boolean | object
  application_name: string | undefined
  fallback_application_name: string | undefined
  options: string | undefined
  parseInputDatesAsUTC: boolean
  statement_timeout: number | false
  lock_timeout: number | false
  idle_in_transaction_session_timeout: number | false
  query_timeout: number | false
  connect_timeout: number
  keepalives: number
  keepalives_idle: number
  parseInt8?: boolean
}

let user: string | undefined
try {
  user = process.platform === 'win32' ? process.env.USERNAME : process.env.USER
} catch {
  // ignore, e.g., Deno without --allow-env
}

const defaults: Defaults = {
  host: 'localhost',
  user,
  database: undefined,
  password: null,
  connectionString: undefined,
  port: 5432,
  rows: 0,
  binary: false,
  max: 10,
  idleTimeoutMillis: 30000,
  client_encoding: '',
  ssl: false,
  application_name: undefined,
  fallback_application_name: undefined,
  options: undefined,
  parseInputDatesAsUTC: false,
  statement_timeout: false,
  lock_timeout: false,
  idle_in_transaction_session_timeout: false,
  query_timeout: false,
  connect_timeout: 0,
  keepalives: 1,
  keepalives_idle: 0,
}

// save default parsers
const parseBigInteger = pgTypes.getTypeParser(20, 'text')
const parseBigIntegerArray = pgTypes.getTypeParser(1016, 'text')

// parse int8 so you can get your count values as actual numbers
Object.defineProperty(defaults, 'parseInt8', {
  configurable: true,
  enumerable: true,
  set(val: boolean) {
    pgTypes.setTypeParser(20, 'text', val ? pgTypes.getTypeParser(23, 'text') : parseBigInteger)
    pgTypes.setTypeParser(1016, 'text', val ? pgTypes.getTypeParser(1007, 'text') : parseBigIntegerArray)
  },
})

export default defaults
