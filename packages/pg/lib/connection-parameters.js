'use strict'

const dns = require('dns')

const defaults = require('./defaults')

const parse = require('pg-connection-string').parse // parses a connection string

const { resolveAuthRequirement } = require('./require-auth')

const { resolveChannelBinding } = require('./channel-binding')

const val = function (key, config, envVar) {
  if (config[key]) {
    return config[key]
  }

  if (envVar === undefined) {
    envVar = process.env['PG' + key.toUpperCase()]
  } else if (envVar === false) {
    // do nothing ... use false
  } else {
    envVar = process.env[envVar]
  }

  return envVar || defaults[key]
}

// These two are spelled as libpq spells them, as client_encoding and application_name
// are, so a camelCased attempt at one is not recognized. Both exist to refuse weak
// authentication, so proceeding without them would make exactly the connection they were
// set to prevent: an error, and not a warning, which the connection would outlive.
const libpqSpellings = { channelBinding: 'channel_binding', requireAuth: 'require_auth' }

const rejectCamelCasedOptions = function (config) {
  for (const [camelCased, libpqSpelling] of Object.entries(libpqSpellings)) {
    if (config[camelCased] !== undefined) {
      throw new Error(`The ${camelCased} option is not recognized: spell it ${libpqSpelling}, as libpq does.`)
    }
  }
}

const readSSLConfigFromEnvironment = function () {
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
const quoteParamValue = function (value) {
  return "'" + ('' + value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

const add = function (params, config, paramName) {
  const value = config[paramName]
  if (value !== undefined && value !== null) {
    params.push(paramName + '=' + quoteParamValue(value))
  }
}

class ConnectionParameters {
  // `native` says these parameters are for libpq rather than this library's own protocol
  // implementation, which decides who checks what: libpq negotiates SSL of its own accord
  // and performs authentication methods this library does not, so a configuration it can
  // honor must not be rejected here.
  constructor(config, { native = false } = {}) {
    // The boolean enableChannelBinding option is only honored in the client config:
    // a connection string carries libpq's channel_binding parameter instead.
    const enableChannelBinding = typeof config === 'string' ? undefined : config && config.enableChannelBinding

    // if a string is passed, it is a raw connection string so we parse it into a config
    config = typeof config === 'string' ? parse(config) : config || {}

    // if the config has a connectionString defined, parse IT into the config we use
    // this will override other default values with what is stored in connectionString
    if (config.connectionString) {
      // The parser suppresses its sslmode deprecation warning when channel binding
      // is required, so it needs any setting that is not in the connection string.
      const channelBinding = resolveChannelBinding(config.channel_binding, enableChannelBinding)
      config = Object.assign({}, config, parse(config.connectionString, { channelBinding }))
    }

    // After the merge, so that a camelCased query parameter is caught as well: the parser
    // passes through anything it does not recognize.
    rejectCamelCasedOptions(config)

    this.user = val('user', config)
    this.database = val('database', config)

    if (this.database === undefined) {
      this.database = this.user
    }

    this.port = parseInt(val('port', config), 10)
    this.host = val('host', config)

    // "hiding" the password so it doesn't show up in stack traces
    // or if the client is console.logged
    Object.defineProperty(this, 'password', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: val('password', config),
    })

    this.binary = val('binary', config)
    this.options = val('options', config)

    this.ssl = typeof config.ssl === 'undefined' ? readSSLConfigFromEnvironment() : config.ssl

    if (typeof this.ssl === 'string') {
      if (this.ssl === 'true') {
        this.ssl = true
      }
    }
    // support passing in ssl=no-verify via connection string
    if (this.ssl === 'no-verify') {
      this.ssl = { rejectUnauthorized: false }
    }
    if (this.ssl && this.ssl.key) {
      Object.defineProperty(this.ssl, 'key', {
        enumerable: false,
      })
    }

    // How to negotiate SSL: 'postgres' (default, the traditional SSLRequest
    // handshake) or 'direct' (start the TLS handshake immediately on connect).
    this.sslnegotiation = val('sslnegotiation', config, 'PGSSLNEGOTIATION')
    if (this.sslnegotiation !== undefined && this.sslnegotiation !== 'postgres' && this.sslnegotiation !== 'direct') {
      throw new Error(
        `Invalid sslnegotiation value: "${this.sslnegotiation}". Valid values are "postgres" and "direct".`
      )
    }
    if (this.sslnegotiation === 'direct' && !this.ssl) {
      throw new Error('sslnegotiation=direct requires SSL to be enabled')
    }

    // Use of SCRAM channel binding: 'require', 'prefer' (the default, using it when
    // the server offers it) or 'disable'.
    this.channel_binding = resolveChannelBinding(config.channel_binding, enableChannelBinding)
    // This client only encrypts a connection when asked to, so requiring a binding to the
    // server's certificate without SSL could never be satisfied. libpq, on the other hand,
    // negotiates SSL by default, and reports the shortfall itself if it ends up without.
    if (!native && this.channel_binding === 'require' && !this.ssl) {
      throw new Error('channel_binding=require requires SSL to be enabled')
    }

    // The authentication method(s) the server may ask for. The requirement derived from
    // it, which the client enforces, also carries any channel binding requirement.
    // An explicitly empty value requires nothing and is honored over the environment, as
    // it is in libpq's own conninfo; val() would fall through to the environment instead,
    // since it tests truthiness. It is kept as an empty string rather than dropped, so
    // that it reaches libpq: absence there is not the same thing, because libpq reads
    // PGREQUIREAUTH itself for a parameter the conninfo does not mention, and an empty one
    // it takes to require nothing. The cost is that a libpq older than PostgreSQL 16 will
    // reject the parameter, but only for someone who asked for it by name.
    const requireAuth =
      config.require_auth !== undefined ? config.require_auth : val('require_auth', config, 'PGREQUIREAUTH')
    this.require_auth = requireAuth ?? undefined
    this.authRequirement = resolveAuthRequirement(this.require_auth, this.channel_binding, { native })

    this.client_encoding = val('client_encoding', config)
    this.replication = val('replication', config)
    // a domain socket begins with '/'
    this.isDomainSocket = !(this.host || '').indexOf('/')

    this.application_name = val('application_name', config, 'PGAPPNAME')
    this.fallback_application_name = val('fallback_application_name', config, false)
    this.statement_timeout = val('statement_timeout', config, false)
    this.lock_timeout = val('lock_timeout', config, false)
    this.idle_in_transaction_session_timeout = val('idle_in_transaction_session_timeout', config, false)
    this.query_timeout = val('query_timeout', config, false)

    if (config.connectionTimeoutMillis === undefined) {
      this.connect_timeout = process.env.PGCONNECT_TIMEOUT || 0
    } else {
      this.connect_timeout = Math.floor(config.connectionTimeoutMillis / 1000)
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

  getLibpqConnectionString(cb) {
    const params = []
    add(params, this, 'user')
    add(params, this, 'password')
    add(params, this, 'port')
    add(params, this, 'application_name')
    add(params, this, 'fallback_application_name')
    add(params, this, 'connect_timeout')
    add(params, this, 'options')

    const ssl = typeof this.ssl === 'object' ? this.ssl : this.ssl ? { sslmode: this.ssl } : {}
    add(params, ssl, 'sslmode')
    add(params, ssl, 'sslca')
    add(params, ssl, 'sslkey')
    add(params, ssl, 'sslcert')
    add(params, ssl, 'sslrootcert')
    add(params, this, 'sslnegotiation')
    // Only when it differs from libpq's own default, so that we neither say anything
    // redundant nor pass an unknown parameter to a libpq older than PostgreSQL 11.
    if (this.channel_binding !== 'prefer') {
      add(params, this, 'channel_binding')
    }
    // Needs no such guard: this is undefined unless it was asked for, and add() skips
    // undefined values, so a libpq older than PostgreSQL 16 is never passed a parameter
    // it would reject.
    add(params, this, 'require_auth')

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
      return cb(null, params.join(' '))
    }
    if (this.client_encoding) {
      params.push('client_encoding=' + quoteParamValue(this.client_encoding))
    }
    dns.lookup(this.host, function (err, address) {
      if (err) return cb(err, null)
      params.push('hostaddr=' + quoteParamValue(address))
      return cb(null, params.join(' '))
    })
  }
}

module.exports = ConnectionParameters
