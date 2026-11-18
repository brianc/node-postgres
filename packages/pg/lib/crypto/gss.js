'use strict'

function authenticationError(message, cause) {
  const error = new Error(message)
  error.code = 'PG_GSS_AUTHENTICATION_FAILED'
  if (cause !== undefined) error.cause = cause
  return error
}

function serviceName(parameters, platform) {
  const service = parameters.krbsrvname || 'postgres'
  const host = parameters.gssHost
  if (typeof service !== 'string' || !service || /[@/\\\0]/.test(service)) {
    throw authenticationError('Invalid Kerberos service name')
  }
  if (typeof host !== 'string' || !host || /[@/\\\0]/.test(host)) {
    throw authenticationError('Kerberos authentication requires a database hostname')
  }
  if (parameters.gsslib && parameters.gsslib !== (platform === 'win32' ? 'sspi' : 'gssapi')) {
    throw authenticationError('The requested GSS library is not supported by the Kerberos binding on this platform')
  }
  return platform === 'win32' ? `${service}/${host}` : `${service}@${host}`
}

class GssSession {
  constructor(parameters, method, send, binding) {
    this.parameters = parameters
    this.method = method
    this.send = send
    this.binding = binding
    this.client = null
    this.closed = false
    this.accepted = false
    this.rounds = 0
    this.queue = Promise.resolve()
  }

  enqueue(action) {
    this.queue = this.queue.then(() => {
      if (!this.closed) return action()
    })
    return this.queue
  }

  loadBinding() {
    let binding = this.binding
    if (!binding) {
      try {
        binding = require('kerberos')
      } catch (cause) {
        throw authenticationError(
          'GSS authentication requires the optional kerberos package and a compatible native binding',
          cause
        )
      }
    }
    if (!binding || typeof binding.initializeClient !== 'function') {
      throw authenticationError('The Kerberos binding does not provide initializeClient')
    }
    if (
      typeof binding.GSS_C_MUTUAL_FLAG !== 'number' ||
      typeof binding.GSS_C_REPLAY_FLAG !== 'number' ||
      typeof binding.GSS_C_SEQUENCE_FLAG !== 'number' ||
      typeof binding.GSS_MECH_OID_KRB5 !== 'number' ||
      typeof binding.GSS_MECH_OID_SPNEGO !== 'number'
    ) {
      throw authenticationError('The Kerberos binding does not provide the required authentication mechanisms')
    }
    return binding
  }

  start() {
    return this.enqueue(async () => {
      const service = serviceName(this.parameters, process.platform)
      const binding = this.loadBinding()
      const flags = binding.GSS_C_MUTUAL_FLAG | binding.GSS_C_REPLAY_FLAG | binding.GSS_C_SEQUENCE_FLAG
      const client = await binding.initializeClient(service, {
        mechOID: this.method === 'GSSAPI' ? binding.GSS_MECH_OID_KRB5 : binding.GSS_MECH_OID_SPNEGO,
        gssFlags: flags,
        flags,
      })
      if (this.closed) return
      if (!client || typeof client.step !== 'function') {
        throw authenticationError('The Kerberos binding returned an invalid context')
      }
      this.client = client
      await this.step(Buffer.alloc(0))
    })
  }

  continue(token) {
    if (++this.rounds > 32) {
      return Promise.reject(authenticationError('GSS authentication exceeded its negotiation limit'))
    }
    return this.enqueue(() => {
      if (!Buffer.isBuffer(token) || this.accepted || !this.client) {
        throw authenticationError('Unexpected GSS authentication continuation')
      }
      return this.step(token)
    })
  }

  async step(challenge) {
    const token = await this.client.step(challenge.toString('base64'))
    if (this.closed) return
    if (token === null || token === undefined || token === '') {
      if (this.client.contextComplete !== true) {
        throw authenticationError('GSS authentication returned no token before context completion')
      }
      return
    }
    if (typeof token !== 'string') {
      throw authenticationError('The Kerberos binding returned an invalid token')
    }
    const bytes = Buffer.from(token, 'base64')
    if (bytes.length === 0 || bytes.length > 65535 || bytes.toString('base64') !== token) {
      throw authenticationError('The Kerberos binding returned an invalid base64 token')
    }
    if (!this.send(bytes)) {
      throw authenticationError('The PostgreSQL connection closed during GSS authentication')
    }
  }

  accept() {
    return this.enqueue(() => {
      if (this.accepted || !this.client || this.client.contextComplete !== true) {
        throw authenticationError('The server accepted GSS authentication before the client context completed')
      }
      this.accepted = true
    })
  }

  async ready() {
    await this.queue
    if (this.closed || !this.accepted) {
      throw authenticationError('GSS authentication did not complete')
    }
  }

  dispose() {
    this.closed = true
    this.client = null
    this.binding = null
  }
}

module.exports = { GssSession, serviceName, authenticationError }
