'use strict'
const helper = require('./test-helper')
const BufferList = require('../../buffer-list')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

const sasl = require('../../../lib/crypto/sasl')

function oauthInitialResponse(token) {
  return 'n,,\x01auth=Bearer ' + token + '\x01\x01'
}

function expectedInitialResponse(token) {
  const response = oauthInitialResponse(token)
  return new BufferList()
    .addCString('OAUTHBEARER')
    .addInt32(Buffer.byteLength(response))
    .addString(response)
    .join(true, 'p')
}

function expectedResponse(response) {
  return new BufferList().addString(response).join(true, 'p')
}

function markConnected(client) {
  client.connection.emit('readyForQuery', { status: 'I' })
}

test('sasl/oauth', function () {
  test('selects OAUTHBEARER when token is configured', function () {
    const session = sasl.startSession(['SCRAM-SHA-256', 'OAUTHBEARER'], null, { oauthBearerToken: 'token' })

    assert.equal(session.mechanism, 'OAUTHBEARER')
    assert.equal(session.message, 'SASLInitialResponse')
    assert.equal(session.response, oauthInitialResponse('token'))
  })

  test('selects OAUTHBEARER before SCRAM-SHA-256-PLUS when token is configured', function () {
    const session = sasl.startSession(
      ['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS', 'OAUTHBEARER'],
      {
        getPeerCertificate() {},
      },
      { oauthBearerToken: 'token' }
    )

    assert.equal(session.mechanism, 'OAUTHBEARER')
  })

  test('does not select OAUTHBEARER without token', function () {
    const session = sasl.startSession(['SCRAM-SHA-256', 'OAUTHBEARER'])

    assert.equal(session.mechanism, 'SCRAM-SHA-256')
  })

  test('fails when server only offers OAUTHBEARER and no token is configured', function () {
    assert.throws(
      function () {
        sasl.startSession(['OAUTHBEARER'])
      },
      {
        message: 'SASL: OAUTHBEARER requires an oauthBearerToken',
      }
    )
  })

  test('fails when OAUTHBEARER token is not a string', function () {
    assert.throws(
      function () {
        sasl.startSession(['OAUTHBEARER'], null, { oauthBearerToken: 1 })
      },
      {
        message: 'SASL: OAUTHBEARER token must be a string',
      }
    )
  })

  test('fails when OAUTHBEARER token is empty', function () {
    assert.throws(
      function () {
        sasl.startSession(['OAUTHBEARER'], null, { oauthBearerToken: '' })
      },
      {
        message: 'SASL: OAUTHBEARER token must be a non-empty string',
      }
    )
  })

  test('responds to empty OAUTHBEARER challenge with an empty response', async function () {
    const session = sasl.startSession(['OAUTHBEARER'], null, { oauthBearerToken: 'token' })

    await sasl.continueSession(session, null, '')

    assert.equal(session.message, 'SASLResponse')
    assert.equal(session.response, '\x01')
    assert.equal(session.oauthError, undefined)
  })

  test('stores server error from non-empty OAUTHBEARER challenge', async function () {
    const session = sasl.startSession(['OAUTHBEARER'], null, { oauthBearerToken: 'token' })
    const errorPayload = '{"status":"invalid_token","scope":"openid"}'

    await sasl.continueSession(session, null, errorPayload)

    assert.equal(session.oauthError, errorPayload)
    assert.equal(session.response, '\x01')
  })

  test('stores empty JSON as an OAUTHBEARER error challenge', async function () {
    const session = sasl.startSession(['OAUTHBEARER'], null, { oauthBearerToken: 'token' })

    await sasl.continueSession(session, null, '{}')

    assert.equal(session.oauthError, '{}')
    assert.equal(session.response, '\x01')
  })
})

test('client oauth authentication', function () {
  test('sends OAUTHBEARER initial response with token string', function () {
    const client = helper.createClient()
    client.oauthBearerToken = 'token'
    client.connection.emit('authenticationSASL', { mechanisms: ['OAUTHBEARER'] })

    assert.lengthIs(client.connection.stream.packets, 1)
    assert.equalBuffers(client.connection.stream.packets[0], expectedInitialResponse('token'))
  })

  test('sends OAUTHBEARER initial response with token callback', async function () {
    const client = helper.createClient({
      user: 'foo',
      database: 'bar',
      host: 'baz',
      oauthBearerToken: async (params) => {
        assert.equal(params.user, 'foo')
        assert.equal(params.database, 'bar')
        assert.equal(params.host, 'baz')
        return 'callback-token'
      },
    })

    client.connection.emit('authenticationSASL', { mechanisms: ['OAUTHBEARER'] })
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(typeof client.oauthBearerToken, 'function', 'callback should not be overwritten')
    assert.equal(typeof client.connectionParameters.oauthBearerToken, 'function', 'callback should not be overwritten')
    assert.lengthIs(client.connection.stream.packets, 1)
    assert.equalBuffers(client.connection.stream.packets[0], expectedInitialResponse('callback-token'))
  })

  test('emits error when token callback rejects', async function () {
    const client = helper.createClient({
      oauthBearerToken: async () => {
        throw new Error('token fetch failed')
      },
    })
    markConnected(client)
    const errorPromise = new Promise((resolve) => client.once('error', resolve))

    client.connection.emit('authenticationSASL', { mechanisms: ['OAUTHBEARER'] })
    const err = await errorPromise

    assert.equal(err.message, 'token fetch failed')
  })

  test('emits error when token callback returns a non-string', async function () {
    const client = helper.createClient({ oauthBearerToken: async () => 42 })
    markConnected(client)
    const errorPromise = new Promise((resolve) => client.once('error', resolve))

    client.connection.emit('authenticationSASL', { mechanisms: ['OAUTHBEARER'] })
    const err = await errorPromise

    assert.ok(err instanceof TypeError)
  })

  test('emits error when server returns a non-empty OAUTHBEARER challenge', async function () {
    const client = helper.createClient()
    client.oauthBearerToken = 'token'
    markConnected(client)
    const errorPromise = new Promise((resolve) => client.once('error', resolve))

    client.connection.emit('authenticationSASL', { mechanisms: ['OAUTHBEARER'] })
    client.connection.emit('authenticationSASLContinue', { data: '{"status":"invalid_token"}' })
    const err = await errorPromise

    assert.ok(err.message.includes('invalid_token'))
    assert.lengthIs(client.connection.stream.packets, 2)
    assert.equalBuffers(client.connection.stream.packets[1], expectedResponse('\x01'))
  })
})
