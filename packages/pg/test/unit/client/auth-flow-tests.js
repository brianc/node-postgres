'use strict'

// Drives a Client through complete authentication exchanges against a scripted server,
// which is where requirements like channel_binding=require and require_auth have to
// hold: CVE-2025-49146 was a client that enforced channel binding within its SCRAM
// exchange, but answered a plain password request without a murmur.

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const helper = require('./test-helper')
const Connection = require('../../../lib/connection')
const crypto = require('../../../lib/crypto/utils')
const { Client, MemoryStream } = helper

const suite = new helper.Suite()

const password = 'sekret'

// A real certificate, so the channel binding path hashes something a server could
// actually have presented
const serverCertificate = Buffer.from(
  fs
    .readFileSync(path.join(__dirname, '..', '..', 'tls', 'test-server.crt'), 'utf8')
    .replace(/-----[^-]+-----|\s/g, ''),
  'base64'
)

// Starts a client on a stream that records what it writes, so that authentication
// messages can be fed to it and its answers inspected. With tls, the stream can produce
// a peer certificate, as a TLS socket would.
const startClient = function (config = {}, { tls = false } = {}) {
  const stream = new MemoryStream()
  stream.end = function () {
    this.ended = true
  }
  if (tls) {
    stream.getPeerCertificate = () => ({ raw: serverCertificate })
  }

  const client = new Client({ connection: new Connection({ stream }), password, ...config })
  const errors = []
  // Successful outcomes are recorded as well as failures, so that a test can tell a
  // refused connection from one that was refused and then reported as connected anyway
  const callbacks = []
  const connects = []
  client.on('connect', () => connects.push(true))
  client.connect((err) => {
    callbacks.push(err)
    if (err) errors.push(err)
  })
  stream.packets.length = 0

  return { client, stream, errors, callbacks, connects }
}

// Sends a message from the server to the client
const send = function ({ client }, name, msg = {}) {
  client.connection.emit(name, msg)
}

const until = async function (predicate, description) {
  const deadline = Date.now() + 2000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`)
    await new Promise((resolve) => setImmediate(resolve))
  }
}

// Authentication handlers do real crypto, so their answers have to be waited for rather
// than assumed to have arrived by the next tick
const awaitPackets = function ({ stream }, count) {
  return until(() => stream.packets.length >= count, `the client to send ${count} packet(s)`)
}

const awaitError = async function ({ errors }) {
  await until(() => errors.length > 0, 'the client to report an error')
  return errors[0]
}

// Long enough that a handler which was going to answer would have done so, so that
// 'nothing was sent' means it
const awaitQuiet = function () {
  return new Promise((resolve) => setTimeout(resolve, 25))
}

// Message types the client has written, e.g. ['p'] for a password message or ['X'] for a
// Terminate: enough to tell whether it answered a request or hung up on it
const sentTypes = function ({ stream }) {
  return stream.packets.map((packet) => String.fromCharCode(packet[0]))
}

// A scripted SCRAM-SHA-256 server. Its replies are computed from the messages the client
// actually sent, so the client's own view of the exchange, and of the channel binding in
// particular, is never taken on trust.
const scramServer = {
  salt: Buffer.from('0123456789abcdef'),
  iterations: 4096,

  firstMessage(clientNonce) {
    return `r=${clientNonce}serverpart,s=${this.salt.toString('base64')},i=${this.iterations}`
  },

  async signature(clientNonce, clientFinalMessageWithoutProof) {
    const saltedPassword = await crypto.deriveKey(password, this.salt, this.iterations)
    const serverKey = await crypto.hmacSha256(saltedPassword, 'Server Key')
    const authMessage = [`n=*,r=${clientNonce}`, this.firstMessage(clientNonce), clientFinalMessageWithoutProof].join(
      ','
    )

    return Buffer.from(await crypto.hmacSha256(serverKey, authMessage)).toString('base64')
  },
}

const parseSASLInitialResponse = function (packet) {
  const body = packet.subarray(5) // past the type byte and the length
  const terminator = body.indexOf(0)

  return {
    mechanism: body.subarray(0, terminator).toString(),
    // the response follows its own four-byte length
    response: body.subarray(terminator + 5).toString(),
  }
}

// Runs a whole exchange from the server's side, stopping short of the AuthenticationOk,
// and reports what the client chose to do
const runSASLExchange = async function (connecting, mechanisms) {
  send(connecting, 'authenticationSASL', { mechanisms })
  await awaitPackets(connecting, 1)

  const { mechanism, response } = parseSASLInitialResponse(connecting.stream.packets[0])
  const clientNonce = response
    .split(',')
    .find((part) => part.startsWith('r='))
    .slice(2)

  send(connecting, 'authenticationSASLContinue', { data: scramServer.firstMessage(clientNonce) })
  await awaitPackets(connecting, 2)

  const clientFinalMessage = connecting.stream.packets[1].subarray(5).toString()
  const withoutProof = clientFinalMessage.slice(0, clientFinalMessage.indexOf(',p='))

  send(connecting, 'authenticationSASLFinal', { data: `v=${await scramServer.signature(clientNonce, withoutProof)}` })
  await awaitQuiet()

  return {
    mechanism,
    gs2Header: response.split(',,')[0],
    channelBinding: withoutProof.split(',')[0].slice(2),
  }
}

suite.test('a cleartext password request is answered by default', async function () {
  const connecting = startClient()

  send(connecting, 'authenticationCleartextPassword')
  await awaitPackets(connecting, 1)
  send(connecting, 'authenticationOk')
  await awaitQuiet()

  assert.deepStrictEqual(connecting.errors, [])
  assert.deepStrictEqual(sentTypes(connecting), ['p'])
})

suite.test('an md5 password request is answered by default', async function () {
  const connecting = startClient()

  send(connecting, 'authenticationMD5Password', { salt: Buffer.from([1, 2, 3, 4]) })
  await awaitPackets(connecting, 1)
  send(connecting, 'authenticationOk')
  await awaitQuiet()

  assert.deepStrictEqual(connecting.errors, [])
  assert.deepStrictEqual(sentTypes(connecting), ['p'])
})

suite.test('an immediate AuthenticationOk is accepted by default', async function () {
  // trust authentication: nothing is asked of the client, and nothing is required of it
  const connecting = startClient()

  send(connecting, 'authenticationOk')
  await awaitQuiet()

  assert.deepStrictEqual(connecting.errors, [])
  assert.deepStrictEqual(sentTypes(connecting), [])
})

suite.test('a SCRAM exchange is completed by default', async function () {
  const connecting = startClient()

  const exchange = await runSASLExchange(connecting, ['SCRAM-SHA-256'])
  send(connecting, 'authenticationOk')
  await awaitQuiet()

  assert.deepStrictEqual(connecting.errors, [])
  assert.strictEqual(exchange.mechanism, 'SCRAM-SHA-256')
  assert.strictEqual(connecting.client._authFinished, true)
})

suite.test('channel_binding=require refuses a cleartext password request', async function () {
  const connecting = startClient({ ssl: true, channel_binding: 'require' }, { tls: true })

  send(connecting, 'authenticationCleartextPassword')
  const error = await awaitError(connecting)
  await awaitQuiet()

  assert.strictEqual(error.message, 'The server requested password authentication, but channel_binding=require was set')
  // the password must not have been sent: only a Terminate, closing the connection
  assert.deepStrictEqual(sentTypes(connecting), ['X'])
  assert.strictEqual(connecting.stream.ended, true)
})

suite.test('channel_binding=require refuses an md5 password request', async function () {
  const connecting = startClient({ ssl: true, channel_binding: 'require' }, { tls: true })

  send(connecting, 'authenticationMD5Password', { salt: Buffer.from([1, 2, 3, 4]) })
  const error = await awaitError(connecting)
  await awaitQuiet()

  assert.strictEqual(error.message, 'The server requested md5 authentication, but channel_binding=require was set')
  assert.deepStrictEqual(sentTypes(connecting), ['X'])
})

suite.test('channel_binding=require refuses an immediate AuthenticationOk', async function () {
  const connecting = startClient({ ssl: true, channel_binding: 'require' }, { tls: true })

  send(connecting, 'authenticationOk')
  const error = await awaitError(connecting)

  assert.strictEqual(
    error.message,
    'The server authenticated the client without channel binding, but channel_binding=require was set'
  )
  assert.deepStrictEqual(sentTypes(connecting), ['X'])
})

suite.test('channel_binding=require refuses an exchange that cannot be bound', async function () {
  const connecting = startClient({ ssl: true, channel_binding: 'require' }, { tls: true })

  // a server that offers only the mechanism without channel binding
  send(connecting, 'authenticationSASL', { mechanisms: ['SCRAM-SHA-256'] })
  const error = await awaitError(connecting)
  await awaitQuiet()

  assert.match(error.message, /Channel binding is required, but the server did not offer/)
  assert.deepStrictEqual(sentTypes(connecting), ['X'])
})

suite.test('channel_binding=require completes a bound SCRAM-SHA-256-PLUS exchange', async function () {
  const connecting = startClient({ ssl: true, channel_binding: 'require' }, { tls: true })

  const exchange = await runSASLExchange(connecting, ['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'])
  send(connecting, 'authenticationOk')
  await awaitQuiet()

  assert.deepStrictEqual(connecting.errors, [])
  assert.strictEqual(exchange.mechanism, 'SCRAM-SHA-256-PLUS')
  assert.strictEqual(exchange.gs2Header, 'p=tls-server-end-point')
  // the binding data carries the certificate hash, not just the gs2 header
  assert.ok(exchange.channelBinding.length > 'p=tls-server-end-point,,'.length)
  assert.strictEqual(connecting.client._channelBound, true)
})

suite.test('channel binding is used when preferred and offered, and skipped when disabled', async function () {
  const preferring = startClient({ ssl: true }, { tls: true })
  const preferred = await runSASLExchange(preferring, ['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'])

  assert.deepStrictEqual(preferring.errors, [])
  assert.strictEqual(preferred.mechanism, 'SCRAM-SHA-256-PLUS')

  const disabling = startClient({ ssl: true, channel_binding: 'disable' }, { tls: true })
  const disabled = await runSASLExchange(disabling, ['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'])

  assert.deepStrictEqual(disabling.errors, [])
  assert.strictEqual(disabled.mechanism, 'SCRAM-SHA-256')
  assert.strictEqual(disabled.gs2Header, 'n')
  assert.strictEqual(disabling.client._channelBound, false)
})

suite.test('the enableChannelBinding option still turns channel binding on', async function () {
  const connecting = startClient({ ssl: true, enableChannelBinding: true }, { tls: true })

  const exchange = await runSASLExchange(connecting, ['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'])

  assert.deepStrictEqual(connecting.errors, [])
  assert.strictEqual(exchange.mechanism, 'SCRAM-SHA-256-PLUS')
})

suite.test('requiring channel binding after construction is enforced too', async function () {
  const connecting = startClient({ ssl: true }, { tls: true })
  connecting.client.enableChannelBinding = 'require'

  send(connecting, 'authenticationCleartextPassword')
  const error = await awaitError(connecting)
  await awaitQuiet()

  assert.strictEqual(error.message, 'The server requested password authentication, but channel_binding=require was set')
  assert.deepStrictEqual(sentTypes(connecting), ['X'])
})

suite.test('a channel binding level set after construction is checked as one given to it', function () {
  const { client } = startClient({ ssl: true }, { tls: true })

  for (const value of ['Require', 'required', 'prefer ', '']) {
    assert.throws(() => {
      client.channelBinding = value
    }, /Invalid channel_binding value/)
    assert.strictEqual(client.channelBinding, 'prefer', 'a refused value should not take effect')
  }

  // The option's original shape, which was a boolean, still means what it did.
  client.enableChannelBinding = false
  assert.strictEqual(client.channelBinding, 'disable')
  client.enableChannelBinding = true
  assert.strictEqual(client.channelBinding, 'prefer')
})

suite.test('require_auth=scram-sha-256 refuses a cleartext password request', async function () {
  const connecting = startClient({ require_auth: 'scram-sha-256' })

  send(connecting, 'authenticationCleartextPassword')
  const error = await awaitError(connecting)
  await awaitQuiet()

  assert.strictEqual(
    error.message,
    'The server requested password authentication, but require_auth="scram-sha-256" was set'
  )
  assert.deepStrictEqual(sentTypes(connecting), ['X'])
})

suite.test('require_auth=scram-sha-256 refuses an AuthenticationOk before any exchange', async function () {
  const connecting = startClient({ require_auth: 'scram-sha-256' })

  send(connecting, 'authenticationOk')
  const error = await awaitError(connecting)

  assert.strictEqual(
    error.message,
    'The server did not complete authentication, but require_auth="scram-sha-256" was set'
  )
})

suite.test('require_auth=scram-sha-256 completes an unbound exchange without SSL', async function () {
  const connecting = startClient({ require_auth: 'scram-sha-256' })

  const exchange = await runSASLExchange(connecting, ['SCRAM-SHA-256'])
  send(connecting, 'authenticationOk')
  await awaitQuiet()

  assert.deepStrictEqual(connecting.errors, [])
  assert.strictEqual(exchange.mechanism, 'SCRAM-SHA-256')
  assert.strictEqual(exchange.gs2Header, 'n')
  assert.strictEqual(connecting.client._authFinished, true)
})

suite.test('require_auth=password answers a cleartext request but refuses md5', async function () {
  const answering = startClient({ require_auth: 'password' })
  send(answering, 'authenticationCleartextPassword')
  await awaitPackets(answering, 1)

  assert.deepStrictEqual(answering.errors, [])
  assert.deepStrictEqual(sentTypes(answering), ['p'])

  const refusing = startClient({ require_auth: 'password' })
  send(refusing, 'authenticationMD5Password', { salt: Buffer.from([1, 2, 3, 4]) })
  await awaitError(refusing)
  await awaitQuiet()

  assert.deepStrictEqual(sentTypes(refusing), ['X'])
})

suite.test('require_auth=!password refuses a cleartext request but answers md5', async function () {
  const refusing = startClient({ require_auth: '!password' })
  send(refusing, 'authenticationCleartextPassword')
  const error = await awaitError(refusing)
  await awaitQuiet()

  assert.strictEqual(
    error.message,
    'The server requested password authentication, but require_auth="!password" was set'
  )
  assert.deepStrictEqual(sentTypes(refusing), ['X'])

  const answering = startClient({ require_auth: '!password' })
  send(answering, 'authenticationMD5Password', { salt: Buffer.from([1, 2, 3, 4]) })
  await awaitPackets(answering, 1)

  assert.deepStrictEqual(answering.errors, [])
  assert.deepStrictEqual(sentTypes(answering), ['p'])
})

suite.test('require_auth=none accepts an immediate AuthenticationOk', async function () {
  const connecting = startClient({ require_auth: 'none' })

  send(connecting, 'authenticationOk')
  await awaitQuiet()

  assert.deepStrictEqual(connecting.errors, [])
  assert.deepStrictEqual(sentTypes(connecting), [])
})

suite.test('a password provider is not consulted for a refused request', async function () {
  // Looking a password up can reach out to a credential service, so the requirement has
  // to be settled before anything else happens.
  let consulted = false
  const connecting = startClient({
    require_auth: 'scram-sha-256',
    password: () => {
      consulted = true
      return password
    },
  })

  send(connecting, 'authenticationCleartextPassword')
  await awaitError(connecting)
  await awaitQuiet()

  assert.strictEqual(consulted, false)
  assert.deepStrictEqual(sentTypes(connecting), ['X'])
})

// A server can pipeline an entire successful login into a single packet, in which case the
// messages that follow a refused request have already arrived and are dispatched after it.
// Everything below is that situation: the refusal has to be the last word.
const sendSuccessfulLogin = function (connecting) {
  send(connecting, 'authenticationOk')
  send(connecting, 'backendKeyData', { processID: 1, secretKey: 2 })
  send(connecting, 'readyForQuery', { status: 'I' })
}

suite.test('a refusal is not undone by messages that were already in flight', async function () {
  const connecting = startClient({ require_auth: 'scram-sha-256' })

  send(connecting, 'authenticationCleartextPassword')
  sendSuccessfulLogin(connecting)
  await awaitQuiet()

  assert.strictEqual(connecting.errors.length, 1, 'the refusal should be reported once')
  assert.strictEqual(
    connecting.errors[0].message,
    'The server requested password authentication, but require_auth="scram-sha-256" was set'
  )
  assert.strictEqual(connecting.callbacks.length, 1, 'connect() should be answered exactly once')
  assert.deepStrictEqual(connecting.connects, [], 'no connect event should be emitted')
  assert.strictEqual(connecting.client._connected, false)
  assert.deepStrictEqual(sentTypes(connecting), ['X'])

  await assert.rejects(() => connecting.client.query('SELECT 1'), /not queryable/)
})

suite.test('a refused SCRAM exchange is not rescued by a pipelined login', async function () {
  const connecting = startClient({ ssl: true, channel_binding: 'require' }, { tls: true })

  // The server offers only the mechanism that cannot be bound, so the client refuses to
  // begin, and then it declares the client logged in as though nothing had happened.
  send(connecting, 'authenticationSASL', { mechanisms: ['SCRAM-SHA-256'] })
  await awaitError(connecting)
  sendSuccessfulLogin(connecting)
  await awaitQuiet()

  assert.match(connecting.errors[0].message, /Channel binding is required, but the server did not offer/)
  assert.strictEqual(connecting.callbacks.length, 1, 'connect() should be answered exactly once')
  assert.deepStrictEqual(connecting.connects, [], 'no connect event should be emitted')
  assert.strictEqual(connecting.client._connected, false)
  assert.deepStrictEqual(sentTypes(connecting), ['X'])
})

suite.test('an asynchronous password lookup is not answered once a refusal has happened', async function () {
  let release
  const connecting = startClient({
    require_auth: 'password',
    password: () => new Promise((resolve) => (release = () => resolve(password))),
  })

  // The request is permitted, so the lookup begins...
  send(connecting, 'authenticationCleartextPassword')
  // ...but the same packet held a request that is not, and by the time the credential
  // service answers there is nothing left to answer with.
  send(connecting, 'authenticationMD5Password', { salt: Buffer.from([1, 2, 3, 4]) })
  const error = await awaitError(connecting)
  await until(() => release !== undefined, 'the password to be asked for')
  release()
  await awaitQuiet()

  assert.strictEqual(error.message, 'The server requested md5 authentication, but require_auth="password" was set')
  assert.deepStrictEqual(sentTypes(connecting), ['X'], 'the password must not be sent')
})

suite.test('a second authentication request is refused after the first was', async function () {
  const connecting = startClient({ require_auth: 'scram-sha-256' })

  send(connecting, 'authenticationCleartextPassword')
  await awaitError(connecting)

  // Asking again with a method the setting does permit gets the server no further: the
  // connection has been given up on, so there is nothing left to answer with.
  send(connecting, 'authenticationSASL', { mechanisms: ['SCRAM-SHA-256'] })
  await awaitQuiet()

  assert.strictEqual(connecting.errors.length, 1, 'the refusal should be reported once')
  assert.deepStrictEqual(sentTypes(connecting), ['X'])
})

suite.test('a request that follows finished authentication is refused', async function () {
  const connecting = startClient()
  await runSASLExchange(connecting, ['SCRAM-SHA-256'])
  assert.deepStrictEqual(connecting.errors, [], 'the exchange itself should succeed')

  // Having satisfied itself that the client knows the password, the server asks to be told
  // it. Nothing this client is configured with, up to and including require_auth, permits
  // a second request, so this holds for a default configuration as much as a strict one.
  send(connecting, 'authenticationCleartextPassword')
  const error = await awaitError(connecting)
  await awaitQuiet()

  assert.match(error.message, /already authenticated/)
  assert.deepStrictEqual(sentTypes(connecting), ['p', 'p', 'X'], 'the two SCRAM messages and no more')
  assert.deepStrictEqual(connecting.connects, [])
})

suite.test('a query queued before a refusal is not sent to the server', async function () {
  const connecting = startClient({ require_auth: 'scram-sha-256' })
  // What a caller queues while the handshake is still going on may be exactly what it did
  // not want an unauthenticated server to see. It is rejected when the stream ends, which
  // a real socket does once the Terminate below has flushed.
  connecting.client.query('SELECT $1::text', ['a secret']).catch(() => {})

  send(connecting, 'authenticationCleartextPassword')
  await awaitError(connecting)
  // The rest of a login the server had already pipelined behind its refused request.
  send(connecting, 'backendKeyData', { processID: 1, secretKey: 2 })
  send(connecting, 'readyForQuery', { status: 'I' })
  await awaitQuiet()

  assert.deepStrictEqual(sentTypes(connecting), ['X'], 'nothing but Terminate should be written')
  assert.strictEqual(connecting.client._queryable, false)
})

// libpq refuses anything but an authentication request at this point in its handshake, so a
// server cannot simply leave authentication out. This client listens for every message from
// the start, so a server that skips straight to declaring the client logged in has to be
// caught where the connection is completed.
suite.test('a server that skips authentication altogether satisfies nothing', async function () {
  const cases = [
    { config: { require_auth: 'scram-sha-256' }, message: /did not complete authentication/ },
    { config: { ssl: true, channel_binding: 'require' }, message: /without channel binding/ },
  ]

  for (const { config, message } of cases) {
    const connecting = startClient(config, { tls: true })

    // Not one authentication message: the server, or someone in the middle holding a
    // certificate this client was willing to accept, just says the client is in.
    send(connecting, 'backendKeyData', { processID: 1, secretKey: 2 })
    send(connecting, 'readyForQuery', { status: 'I' })
    const error = await awaitError(connecting)

    assert.match(error.message, message)
    assert.deepStrictEqual(connecting.connects, [], 'no connect event should be emitted')
    assert.strictEqual(connecting.client._connected, false)
    await assert.rejects(() => connecting.client.query('SELECT 1'), /not queryable/)
  }
})

// Connection#end() writes its Terminate and only ends the stream once that has flushed, so
// a write that lands in between still reaches the server. Anything the client computes
// before answering — an md5 hash, a SCRAM proof — takes a turn of the event loop, which is
// long enough for a refusal to have happened.
suite.test('an md5 hash computed before a refusal is not sent after it', async function () {
  const connecting = startClient({ require_auth: 'md5' })

  // Permitted, so hashing begins, and suspends
  send(connecting, 'authenticationMD5Password', { salt: Buffer.from([1, 2, 3, 4]) })
  // Refused, from the same packet, while the hash is still being computed
  send(connecting, 'authenticationCleartextPassword')
  await awaitError(connecting)
  await awaitQuiet()

  assert.deepStrictEqual(sentTypes(connecting), ['X'], 'the hash must not follow the Terminate')
})

suite.test('a SCRAM proof computed before a refusal is not sent after it', async function () {
  const connecting = startClient({ require_auth: 'scram-sha-256' })

  send(connecting, 'authenticationSASL', { mechanisms: ['SCRAM-SHA-256'] })
  await awaitPackets(connecting, 1)
  const { response } = parseSASLInitialResponse(connecting.stream.packets[0])
  const clientNonce = response
    .split(',')
    .find((part) => part.startsWith('r='))
    .slice(2)

  // The proof is derived from the password, which takes thousands of PBKDF2 iterations...
  send(connecting, 'authenticationSASLContinue', { data: scramServer.firstMessage(clientNonce) })
  // ...and the server breaks the requirement while that is still going on
  send(connecting, 'authenticationCleartextPassword')
  await awaitError(connecting)
  await awaitQuiet()

  assert.deepStrictEqual(sentTypes(connecting), ['p', 'X'], 'the proof must not follow the Terminate')
})

suite.test('an exchange in progress is not continued after a refusal', async function () {
  const connecting = startClient({ require_auth: 'scram-sha-256' })

  // The exchange begins, as the setting permits it to
  send(connecting, 'authenticationSASL', { mechanisms: ['SCRAM-SHA-256'] })
  await awaitPackets(connecting, 1)
  const { response } = parseSASLInitialResponse(connecting.stream.packets[0])
  const clientNonce = response
    .split(',')
    .find((part) => part.startsWith('r='))
    .slice(2)

  // Then the server asks for something the setting refuses, and carries on with the
  // exchange as though it had not: continuing would put the client's proof on the wire.
  send(connecting, 'authenticationCleartextPassword')
  send(connecting, 'authenticationSASLContinue', { data: scramServer.firstMessage(clientNonce) })
  await awaitQuiet()

  assert.strictEqual(connecting.errors.length, 1, 'the refusal should be reported once')
  assert.deepStrictEqual(sentTypes(connecting), ['p', 'X'], 'no client final message should follow the Terminate')
})
