'use strict'

// Support for libpq's require_auth parameter, which pins down the authentication
// method(s) the server is allowed to ask for:
// https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNECT-REQUIRE-AUTH

// Every method libpq recognizes. A connection string written for libpq should not be
// rejected here merely for naming a method this client does not implement, so gss, sspi
// and oauth are accepted: they simply never match a request.
const authMethods = ['password', 'md5', 'gss', 'sspi', 'scram-sha-256', 'oauth']

// What this client can actually perform. GSS, SSPI and OAuth are not implemented.
const supportedAuthMethods = ['password', 'md5', 'scram-sha-256']

const quotedList = function (values) {
  return values.map((value) => `"${value}"`).join(', ')
}

// Follows libpq: elements are comma-separated, and either all of them are negated with
// a leading '!', in which case the list starts from everything permitted and subtracts,
// or none are, in which case it starts from nothing permitted and adds. Whitespace is
// not trimmed and repetition is rejected.
const parseRequireAuth = function (requireAuth) {
  const elements = requireAuth.split(',')
  const negated = elements[0].startsWith('!')

  // 'none' is not a method but a statement about whether the server must ask at all,
  // so it is tracked separately from the set of methods.
  const allowedMethods = new Set(negated ? authMethods : [])
  let authRequired = !negated
  const seen = new Set()

  for (const element of elements) {
    if (element.startsWith('!') !== negated) {
      throw new Error(`Invalid require_auth value: "${requireAuth}". Negated methods cannot be mixed with plain ones.`)
    }

    const method = negated ? element.slice(1) : element

    if (method !== 'none' && !authMethods.includes(method)) {
      throw new Error(
        `Invalid require_auth value: "${requireAuth}". Valid methods are ${quotedList(authMethods)} and "none", ` +
          `each optionally negated with "!".`
      )
    }

    if (seen.has(method)) {
      throw new Error(`Invalid require_auth value: "${requireAuth}". Method "${method}" is specified more than once.`)
    }
    seen.add(method)

    if (method === 'none') {
      // 'none' permits a connection the server never challenges, such as trust or
      // certificate authentication; '!none' insists that it challenges.
      authRequired = negated
    } else if (negated) {
      allowedMethods.delete(method)
    } else {
      allowedMethods.add(method)
    }
  }

  return { authRequired, allowedMethods }
}

// Resolves what the server must do to authenticate itself to us, from the require_auth
// and channel_binding settings, or null if any method this client supports will do.
// Throws when no method this client can perform would satisfy the settings, rather than
// leaving a connection that could only ever fail. `native` says the connection is libpq's
// to make, which widens the methods that count as performable.
const resolveAuthRequirement = function (requireAuth, channelBinding, { native = false } = {}) {
  let requirement = null

  if (requireAuth) {
    const { authRequired, allowedMethods } = parseRequireAuth(requireAuth)
    requirement = {
      authRequired,
      allowedMethods,
      channelBindingRequired: false,
      description: `require_auth="${requireAuth}"`,
    }
  }

  if (channelBinding === 'require') {
    // Only a channel-bound SCRAM exchange will do. libpq keeps this check separate from
    // require_auth; treating it as a requirement in its own right means every
    // authentication request is judged in one place.
    if (requirement && !requirement.allowedMethods.has('scram-sha-256')) {
      throw new Error(
        `channel_binding=require cannot be satisfied by ${requirement.description}, ` +
          `which does not permit scram-sha-256 authentication`
      )
    }
    requirement = {
      authRequired: true,
      allowedMethods: new Set(['scram-sha-256']),
      channelBindingRequired: true,
      description: 'channel_binding=require',
    }
  }

  // libpq performs GSS, SSPI and OAuth authentication, which this library does not, and
  // reports for itself when the build in use lacks support for one of them.
  const performableMethods = native ? authMethods : supportedAuthMethods

  if (requirement && requirement.authRequired && !performableMethods.some((m) => requirement.allowedMethods.has(m))) {
    throw new Error(
      `${requirement.description} cannot be satisfied: this client can only perform ` +
        `${quotedList(performableMethods)} authentication`
    )
  }

  return requirement
}

// Mirrors libpq's check_expected_areq: a single check every authentication request
// passes through before the client answers it. `method` is the method the server asked
// for, or 'none' for an AuthenticationOk message, which is require_auth's own name for
// a connection involving no authentication request. Returns null if the request is
// permitted, or the reason it is not.
const checkAuthRequest = function ({ requirement, method, authFinished, channelBound }) {
  if (!requirement) {
    return null
  }

  if (method === 'none') {
    // The server says the client is in, so any requirement has to be satisfied by now.
    // Otherwise a server evades it by never asking at all, as trust authentication
    // does, or by abandoning a SCRAM exchange before it proves who it is.
    if (requirement.channelBindingRequired && !channelBound) {
      return `The server authenticated the client without channel binding, but ${requirement.description} was set`
    }
    if (requirement.authRequired && !authFinished) {
      return `The server did not complete authentication, but ${requirement.description} was set`
    }
    return null
  }

  if (!requirement.allowedMethods.has(method)) {
    return `The server requested ${method} authentication, but ${requirement.description} was set`
  }

  return null
}

module.exports = { resolveAuthRequirement, checkAuthRequest, authMethods, supportedAuthMethods }
