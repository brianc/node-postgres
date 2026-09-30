import { ClientConfig } from 'pg'

export function parse(connectionString: string, options?: Options): ConnectionOptions

// Use of SCRAM channel binding, as libpq's channel_binding parameter defines it
export type ChannelBinding = 'disable' | 'prefer' | 'require'

export interface Options {
  // Use libpq semantics when interpreting the connection string
  useLibpqCompat?: boolean
  // The channel binding setting held by the caller, for cases where it was not
  // given in the connection string. A value of 'require' suppresses the sslmode
  // deprecation warning, since the server is then authenticated by the binding.
  channelBinding?: ChannelBinding
}

interface SSLConfig {
  ca?: string
  cert?: string | null
  key?: string
  rejectUnauthorized?: boolean
}

export interface ConnectionOptions {
  host: string | null
  password?: string
  user?: string
  port?: string | null
  database: string | null | undefined
  client_encoding?: string
  ssl?: boolean | string | SSLConfig
  sslnegotiation?: 'postgres' | 'direct'
  channel_binding?: ChannelBinding
  // The authentication method(s) the server may ask for, as libpq's require_auth
  // parameter defines them: a comma-separated list, optionally negated with '!'
  require_auth?: string

  application_name?: string
  fallback_application_name?: string
  options?: string
  keepalives?: number

  // We allow any other options to be passed through
  [key: string]: unknown
}

export function toClientConfig(config: ConnectionOptions): ClientConfig
export function parseIntoClientConfig(connectionString: string): ClientConfig
