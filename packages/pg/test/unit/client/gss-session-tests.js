'use strict'

const assert = require('assert')
const { GssSession, serviceName } = require('../../../lib/crypto/gss')
const { Suite } = require('../../test-helper')
const ConnectionParameters = require('../../../lib/connection-parameters')

const suite = new Suite()
const initial = Buffer.from([0, 128, 255])
const middle = Buffer.from([255, 0, 128, 1])
const firstChallenge = Buffer.from([128, 1, 0])
const finalChallenge = Buffer.from([255, 2, 0])

function mockBinding(step) {
  const client = { contextComplete: false, step }
  return {
    GSS_C_MUTUAL_FLAG: 2,
    GSS_C_REPLAY_FLAG: 4,
    GSS_C_SEQUENCE_FLAG: 8,
    GSS_MECH_OID_KRB5: 9,
    GSS_MECH_OID_SPNEGO: 6,
    initializeClient: async function (service, options) {
      this.service = service
      this.options = options
      return client
    },
    client,
  }
}

function createSession(binding, method = 'GSSAPI') {
  const sent = []
  const session = new GssSession(
    { krbsrvname: 'postgres', gssHost: 'db.example.test' },
    method,
    (token) => {
      sent.push(token)
      return true
    },
    binding
  )
  return { session, sent }
}

for (const method of ['GSSAPI', 'SSPI']) {
  suite.test(
    `${method} serializes multi-round binary tokens and waits for both context and server acceptance`,
    async () => {
      const challenges = []
      const binding = mockBinding(async (challenge) => {
        challenges.push(Buffer.from(challenge, 'base64'))
        if (!challenge) return initial.toString('base64')
        if (challenge === firstChallenge.toString('base64')) return middle.toString('base64')
        assert.strictEqual(challenge, finalChallenge.toString('base64'))
        binding.client.contextComplete = true
        return null
      })
      const { session, sent } = createSession(binding, method)
      session.start()
      session.continue(firstChallenge)
      session.continue(finalChallenge)
      session.accept()
      await session.ready()

      assert.deepStrictEqual(challenges, [Buffer.alloc(0), firstChallenge, finalChallenge])
      assert.deepStrictEqual(sent, [initial, middle])
      assert.strictEqual(binding.options.mechOID, method === 'GSSAPI' ? 9 : 6)
      assert.strictEqual(binding.options.gssFlags & 1, 0, 'do not delegate credentials')
      assert.strictEqual(binding.options.flags & 2, 2, 'request mutual authentication')
      assert.strictEqual(session.accepted, true)
      session.dispose()
    }
  )
}

suite.test('does not accept server success before the security context completes', async () => {
  const { session } = createSession(mockBinding(async () => initial.toString('base64')))
  await session.start()
  await assert.rejects(session.accept(), /before the client context completed/)
  await assert.rejects(session.ready(), /before the client context completed/)
  assert.strictEqual(session.accepted, false)
  session.dispose()
})

suite.test('does not send an initialization result after cancellation', async () => {
  let resolveContext
  const binding = mockBinding(async () => initial.toString('base64'))
  binding.initializeClient = () =>
    new Promise((resolve) => {
      resolveContext = resolve
    })
  const { session, sent } = createSession(binding)
  const started = session.start()
  await Promise.resolve()
  session.dispose()
  resolveContext(binding.client)
  await started
  assert.deepStrictEqual(sent, [])
  assert.strictEqual(session.client, null)
  await assert.rejects(session.ready(), /did not complete/)
})

suite.test('does not send a late security token after cancellation', async () => {
  let resolveStep
  const { session, sent } = createSession(
    mockBinding(
      () =>
        new Promise((resolve) => {
          resolveStep = resolve
        })
    )
  )
  const started = session.start()
  for (let tick = 0; tick < 3; tick++) await Promise.resolve()
  assert.strictEqual(typeof resolveStep, 'function')
  session.dispose()
  resolveStep(initial.toString('base64'))
  await started
  assert.deepStrictEqual(sent, [])
  assert.strictEqual(session.client, null)
})

for (const token of [null, '', 42, 'not!base64', Buffer.alloc(65536).toString('base64')]) {
  suite.test(`rejects invalid or incomplete security tokens (${typeof token})`, async () => {
    const { session, sent } = createSession(mockBinding(async () => token))
    await assert.rejects(session.start(), /no token before context completion|invalid.*token/)
    assert.deepStrictEqual(sent, [])
    session.dispose()
  })
}

suite.test('rejects a failed transport write', async () => {
  const binding = mockBinding(async () => initial.toString('base64'))
  const session = new GssSession({ gssHost: 'db.example.test' }, 'GSSAPI', () => false, binding)
  await assert.rejects(session.start(), /closed during GSS authentication/)
  session.dispose()
})

suite.test('bounds excessive continuation requests', async () => {
  const { session } = createSession(mockBinding(async () => initial.toString('base64')))
  await session.start()
  for (let round = 0; round < 32; round++) await session.continue(firstChallenge)
  await assert.rejects(session.continue(firstChallenge), /negotiation limit/)
  session.dispose()
})

suite.test('preserves the database hostname through a loopback proxy and uses platform SPN syntax', () => {
  const parameters = new ConnectionParameters({ host: '127.0.0.1', gssHost: 'db.example.test', krbsrvname: 'postgres' })
  assert.strictEqual(serviceName(parameters, 'win32'), 'postgres/db.example.test')
  assert.strictEqual(serviceName(parameters, 'linux'), 'postgres@db.example.test')
  assert.throws(() => serviceName({ gssHost: '/tmp/socket' }, 'linux'), /requires a database hostname/)
  assert.throws(
    () => serviceName({ gssHost: 'db.example.test', krbsrvname: 'postgres/other' }, 'linux'),
    /service name/
  )
})

suite.test('profile settings take precedence over libpq-compatible GSS environment options', () => {
  const saved = { service: process.env.PGKRBSRVNAME, encryption: process.env.PGGSSENCMODE }
  try {
    process.env.PGKRBSRVNAME = 'environment-service'
    process.env.PGGSSENCMODE = 'require'
    const inherited = new ConnectionParameters({})
    assert.strictEqual(inherited.krbsrvname, 'environment-service')
    assert.strictEqual(inherited.gssencmode, 'require')
    const explicit = new ConnectionParameters({ krbsrvname: 'explicit-service', gssencmode: 'disable' })
    assert.strictEqual(explicit.krbsrvname, 'explicit-service')
    assert.strictEqual(explicit.gssencmode, 'disable')
  } finally {
    if (saved.service === undefined) delete process.env.PGKRBSRVNAME
    else process.env.PGKRBSRVNAME = saved.service
    if (saved.encryption === undefined) delete process.env.PGGSSENCMODE
    else process.env.PGGSSENCMODE = saved.encryption
  }
})
