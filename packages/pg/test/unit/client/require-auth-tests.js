'use strict'
const assert = require('assert')
const helper = require('./test-helper')
const { resolveAuthRequirement, checkAuthRequest } = require('../../../lib/require-auth')

const suite = new helper.Suite()

const allowedMethods = function (requireAuth, channelBinding) {
  return [...resolveAuthRequirement(requireAuth, channelBinding).allowedMethods].sort()
}

suite.test('nothing is required by default', function () {
  assert.strictEqual(resolveAuthRequirement(undefined, 'prefer'), null)
  assert.strictEqual(resolveAuthRequirement(undefined, 'disable'), null)
  // libpq treats an empty setting as no setting at all
  assert.strictEqual(resolveAuthRequirement('', 'prefer'), null)
})

suite.test('a plain list permits only the methods it names', function () {
  const requirement = resolveAuthRequirement('md5,scram-sha-256', 'prefer')

  assert.deepStrictEqual([...requirement.allowedMethods].sort(), ['md5', 'scram-sha-256'])
  assert.strictEqual(requirement.authRequired, true)
  assert.strictEqual(requirement.channelBindingRequired, false)
  assert.strictEqual(requirement.description, 'require_auth="md5,scram-sha-256"')
})

suite.test('a negated list permits everything it does not name', function () {
  const requirement = resolveAuthRequirement('!password,!md5', 'prefer')

  assert.deepStrictEqual([...requirement.allowedMethods].sort(), ['gss', 'oauth', 'scram-sha-256', 'sspi'])
  // as in libpq, a negated list starts from a connection that need not authenticate
  assert.strictEqual(requirement.authRequired, false)
})

suite.test('none permits a server that never asks for authentication', function () {
  const requirement = resolveAuthRequirement('none', 'prefer')

  assert.strictEqual(requirement.authRequired, false)
  assert.deepStrictEqual([...requirement.allowedMethods], [])
})

suite.test('!none insists that the server asks for authentication', function () {
  const requirement = resolveAuthRequirement('!none', 'prefer')

  assert.strictEqual(requirement.authRequired, true)
  assert.deepStrictEqual(allowedMethods('!none', 'prefer'), [
    'gss',
    'md5',
    'oauth',
    'password',
    'scram-sha-256',
    'sspi',
  ])
})

suite.test('methods this client cannot perform are accepted alongside ones it can', function () {
  // A connection string shared with libpq should not be rejected out of hand: gss
  // simply never matches a request pg is able to receive.
  assert.deepStrictEqual(allowedMethods('gss,md5', 'prefer'), ['gss', 'md5'])
  assert.deepStrictEqual(allowedMethods('scram-sha-256,sspi', 'prefer'), ['scram-sha-256', 'sspi'])
})

suite.test('a requirement this client could never satisfy is rejected', function () {
  for (const requireAuth of ['gss', 'oauth', 'gss,sspi']) {
    assert.throws(() => resolveAuthRequirement(requireAuth, 'prefer'), {
      message: `require_auth="${requireAuth}" cannot be satisfied: this client can only perform "password", "md5", "scram-sha-256" authentication`,
    })
  }

  // Negating every method it supports leaves the same dead end, unless an
  // unauthenticated connection is still permitted
  assert.throws(() => resolveAuthRequirement('!password,!md5,!scram-sha-256,!none', 'prefer'), /cannot be satisfied/)
  assert.strictEqual(resolveAuthRequirement('!password,!md5,!scram-sha-256', 'prefer').authRequired, false)
})

suite.test('libpq performs methods this client cannot, so a native connection permits them', function () {
  const requirement = resolveAuthRequirement('gss,sspi', 'prefer', { native: true })
  assert.deepStrictEqual([...requirement.allowedMethods].sort(), ['gss', 'sspi'])

  assert.throws(() => resolveAuthRequirement('gss,sspi', 'prefer'), {
    message:
      'require_auth="gss,sspi" cannot be satisfied: this client can only perform "password", "md5", "scram-sha-256" authentication',
  })
})

suite.test('malformed values are rejected', function () {
  assert.throws(() => resolveAuthRequirement('password,!md5', 'prefer'), {
    message: 'Invalid require_auth value: "password,!md5". Negated methods cannot be mixed with plain ones.',
  })
  assert.throws(() => resolveAuthRequirement('!md5,password', 'prefer'), /cannot be mixed/)
  assert.throws(() => resolveAuthRequirement('md5,md5', 'prefer'), {
    message: 'Invalid require_auth value: "md5,md5". Method "md5" is specified more than once.',
  })
  assert.throws(() => resolveAuthRequirement('none,none', 'prefer'), /more than once/)
  assert.throws(() => resolveAuthRequirement('scram-sha-1', 'prefer'), /Valid methods are/)
  // As in libpq, whitespace is not trimmed: a typo here is a security problem
  assert.throws(() => resolveAuthRequirement('md5, password', 'prefer'), /Valid methods are/)
  assert.throws(() => resolveAuthRequirement('md5,', 'prefer'), /Valid methods are/)
})

suite.test('channel_binding=require narrows the requirement to bound SCRAM', function () {
  for (const requireAuth of [undefined, 'scram-sha-256', 'md5,scram-sha-256', '!password']) {
    const requirement = resolveAuthRequirement(requireAuth, 'require')

    assert.deepStrictEqual([...requirement.allowedMethods], ['scram-sha-256'])
    assert.strictEqual(requirement.authRequired, true)
    assert.strictEqual(requirement.channelBindingRequired, true)
    assert.strictEqual(requirement.description, 'channel_binding=require')
  }
})

suite.test('channel_binding=require conflicts with a require_auth that rules out SCRAM', function () {
  for (const requireAuth of ['md5', 'password,md5', '!scram-sha-256', 'none']) {
    assert.throws(() => resolveAuthRequirement(requireAuth, 'require'), {
      message: `channel_binding=require cannot be satisfied by require_auth="${requireAuth}", which does not permit scram-sha-256 authentication`,
    })
  }
})

suite.test('every request is permitted when nothing is required', function () {
  for (const method of ['password', 'md5', 'scram-sha-256', 'none']) {
    assert.strictEqual(checkAuthRequest({ requirement: null, method, authFinished: false, channelBound: false }), null)
  }
})

suite.test('a request for a method that is not permitted is refused', function () {
  const requirement = resolveAuthRequirement('scram-sha-256', 'prefer')

  assert.strictEqual(checkAuthRequest({ requirement, method: 'scram-sha-256' }), null)
  assert.strictEqual(
    checkAuthRequest({ requirement, method: 'password' }),
    'The server requested password authentication, but require_auth="scram-sha-256" was set'
  )
  assert.strictEqual(
    checkAuthRequest({ requirement, method: 'md5' }),
    'The server requested md5 authentication, but require_auth="scram-sha-256" was set'
  )
})

suite.test('an AuthenticationOk that completes no exchange is refused', function () {
  const requirement = resolveAuthRequirement('scram-sha-256', 'prefer')

  assert.strictEqual(
    checkAuthRequest({ requirement, method: 'none', authFinished: false }),
    'The server did not complete authentication, but require_auth="scram-sha-256" was set'
  )
  assert.strictEqual(checkAuthRequest({ requirement, method: 'none', authFinished: true }), null)
})

suite.test('an AuthenticationOk needs no exchange when none is permitted', function () {
  const requirement = resolveAuthRequirement('none', 'prefer')

  assert.strictEqual(checkAuthRequest({ requirement, method: 'none', authFinished: false }), null)
})

suite.test('an unbound exchange cannot satisfy channel_binding=require', function () {
  // startSession refuses to pick a mechanism that cannot be bound, so this is the
  // second line of defence: even a completed exchange has to have been bound.
  const requirement = resolveAuthRequirement(undefined, 'require')

  assert.strictEqual(
    checkAuthRequest({ requirement, method: 'none', authFinished: true, channelBound: false }),
    'The server authenticated the client without channel binding, but channel_binding=require was set'
  )
  assert.strictEqual(checkAuthRequest({ requirement, method: 'none', authFinished: true, channelBound: true }), null)
})
