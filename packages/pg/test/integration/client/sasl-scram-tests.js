'use strict'
const helper = require('./../test-helper')
const pg = helper.pg
const suite = new helper.Suite()
const { native } = helper.args
const assert = require('assert')

/**
 * This test only executes if the env variables SCRAM_TEST_PGUSER and
 * SCRAM_TEST_PGPASSWORD are defined. You can override additional values
 * for the host, port and database with other SCRAM_TEST_ prefixed vars.
 * If the variables are not defined the test will be skipped.
 *
 * The channel binding tests additionally need a server with SSL configured, since
 * binding hashes the server's certificate. They are skipped when PGTESTNOSSL is set,
 * as the SSL tests in test/integration/gh-issues/2085-tests.js are. See LOCAL_DEV.md
 * for setting up a local server with SSL.
 *
 * SQL to create test role:
 *
 *     SET password_encryption = 'scram-sha-256';
 *     CREATE ROLE scram_test login password 'test4scram';
 *
 * Add the following entries to pg_hba.conf:
 *
 *     host   all   scram_test   ::1/128    scram-sha-256
 *     host   all    scram_test   0.0.0.0/0   scram-sha-256
 *
 * Then run this file with after exporting:
 *
 *     SCRAM_TEST_PGUSER=scram_test
 *     SCRAM_TEST_PGPASSWORD=test4scram
 */

// Base config for SCRAM tests
const config = {
  user: process.env.SCRAM_TEST_PGUSER,
  password: process.env.SCRAM_TEST_PGPASSWORD,
  host: process.env.SCRAM_TEST_PGHOST, // optional
  port: process.env.SCRAM_TEST_PGPORT, // optional
  database: process.env.SCRAM_TEST_PGDATABASE, // optional
}

if (native) {
  suite.test('skipping SCRAM tests (on native)', () => {})
  return
}
if (!config.user || !config.password) {
  suite.test('skipping SCRAM tests (missing env)', () => {})
  return
}

// Whether SSL is in use decides which mechanisms the server offers, so these tests say
// so themselves rather than inheriting whatever PGSSLMODE happens to hold.
const sslConfig = { ...config, ssl: { rejectUnauthorized: false } }
const noSslConfig = { ...config, ssl: false }

// The SASL session is discarded as soon as authentication finishes, so the mechanism has
// to be noted while the exchange is still in flight. Returns it alongside whether the
// connection was encrypted, since a test asserting on one wants to be sure of the other.
async function authenticate(clientConfig) {
  const client = new pg.Client(clientConfig)
  let mechanism = null
  client.connection.once('authenticationSASLContinue', () => {
    mechanism = client.saslSession.mechanism
  })
  await client.connect()
  const encrypted = Boolean(client.connection.stream.encrypted)
  const { rows } = await client.query('SELECT 1 AS one')
  assert.strictEqual(rows[0].one, 1, 'the connection should be usable once authenticated')
  await client.end()
  return { mechanism, encrypted }
}

suite.test('sasl/scram authenticates without channel binding when SSL is not in use', async () => {
  // channel_binding defaults to 'prefer', and a server only offers SCRAM-SHA-256-PLUS
  // over SSL, so an unbound exchange is the negotiated outcome here.
  const { mechanism, encrypted } = await authenticate(noSslConfig)
  assert.strictEqual(encrypted, false, 'this test is meant to run over an unencrypted connection')
  assert.strictEqual(mechanism, 'SCRAM-SHA-256')
})

suite.test('can connect using sasl/scram with channel binding disabled', async () => {
  const client = new pg.Client({ ...config, enableChannelBinding: false })
  let usingSASLWithoutChannelBinding = false
  client.connection.once('authenticationSASLContinue', () => {
    usingSASLWithoutChannelBinding = client.saslSession.mechanism === 'SCRAM-SHA-256'
  })
  await client.connect()
  assert.ok(usingSASLWithoutChannelBinding, 'Should be using SCRAM-SHA-256 (no channel binding) for authentication')
  await client.end()
})

if (process.env.PGTESTNOSSL) {
  suite.test('skipping SCRAM channel binding tests (PGTESTNOSSL)', () => {})
} else {
  // A bound exchange only completes if the server agrees with the certificate hash the
  // client computed, so these tests check the binding itself and not merely which
  // mechanism was chosen.
  suite.test('sasl/scram binds the channel when channel_binding=require', async () => {
    const { mechanism, encrypted } = await authenticate({ ...sslConfig, channel_binding: 'require' })
    assert.ok(encrypted, 'expected the connection to be upgraded to a TLS socket')
    assert.strictEqual(mechanism, 'SCRAM-SHA-256-PLUS')
  })

  suite.test('sasl/scram binds the channel by default when SSL is in use', async () => {
    // channel_binding defaults to 'prefer', which takes the server up on its offer
    const { mechanism } = await authenticate(sslConfig)
    assert.strictEqual(mechanism, 'SCRAM-SHA-256-PLUS')
  })

  suite.test('sasl/scram leaves the channel unbound when channel_binding=disable', async () => {
    const { mechanism } = await authenticate({ ...sslConfig, channel_binding: 'disable' })
    assert.strictEqual(mechanism, 'SCRAM-SHA-256')
  })

  suite.test('channel_binding in a connection string binds the channel', async () => {
    const user = encodeURIComponent(config.user)
    const password = encodeURIComponent(config.password)
    const host = config.host || helper.config.host
    const port = config.port || helper.config.port
    const database = config.database || helper.config.database
    const params = 'sslmode=no-verify&channel_binding=require'
    const connectionString = `postgres://${user}:${password}@${host}:${port}/${database}?${params}`

    const { mechanism, encrypted } = await authenticate({ connectionString })
    assert.ok(encrypted, 'expected the connection to be upgraded to a TLS socket')
    assert.strictEqual(mechanism, 'SCRAM-SHA-256-PLUS')
  })

  suite.test('the deprecated enableChannelBinding option still governs channel binding', async () => {
    const enabled = await authenticate({ ...sslConfig, enableChannelBinding: true })
    assert.strictEqual(enabled.mechanism, 'SCRAM-SHA-256-PLUS')

    const disabled = await authenticate({ ...sslConfig, enableChannelBinding: false })
    assert.strictEqual(disabled.mechanism, 'SCRAM-SHA-256')
  })

  suite.test('channel_binding=require is satisfied alongside require_auth=scram-sha-256', async () => {
    const { mechanism } = await authenticate({
      ...sslConfig,
      channel_binding: 'require',
      require_auth: 'scram-sha-256',
    })
    assert.strictEqual(mechanism, 'SCRAM-SHA-256-PLUS')
  })
}

suite.test('sasl/scram fails when password is wrong', async () => {
  const client = new pg.Client({
    ...config,
    password: config.password + 'append-something-to-make-it-bad',
  })
  let usingSasl = false
  client.connection.once('authenticationSASL', () => {
    usingSasl = true
  })
  await assert.rejects(
    () => client.connect(),
    {
      code: '28P01',
    },
    'Error code should be for a password error'
  )
  assert.ok(usingSasl, 'Should be using SASL for authentication')
})

suite.test('sasl/scram fails when password is empty', async () => {
  const client = new pg.Client({
    ...config,
    // We use a password function here so the connection defaults do not
    // override the empty string value with one from process.env.PGPASSWORD
    password: () => '',
  })
  let usingSasl = false
  client.connection.once('authenticationSASL', () => {
    usingSasl = true
  })
  await assert.rejects(
    () => client.connect(),
    {
      message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string',
    },
    'Error code should be for a password error'
  )
  assert.ok(usingSasl, 'Should be using SASL for authentication')
})

suite.test('require_auth permits the method the server asks for', async () => {
  const { mechanism } = await authenticate({ ...config, require_auth: 'scram-sha-256' })
  assert.ok(mechanism, 'expected a SCRAM exchange to have taken place')
})

suite.test('require_auth permits the method the server asks for when named by exclusion', async () => {
  const { mechanism } = await authenticate({ ...config, require_auth: '!password,!md5' })
  assert.ok(mechanism, 'expected a SCRAM exchange to have taken place')
})

suite.test('require_auth refuses a server asking for a method it does not name', async () => {
  const client = new pg.Client({ ...config, require_auth: 'md5' })
  await assert.rejects(() => client.connect(), {
    message: 'The server requested scram-sha-256 authentication, but require_auth="md5" was set',
  })
})

suite.test('require_auth=none refuses a server that demands a password', async () => {
  const client = new pg.Client({ ...config, require_auth: 'none' })
  await assert.rejects(() => client.connect(), {
    message: 'The server requested scram-sha-256 authentication, but require_auth="none" was set',
  })
})

suite.test('PGREQUIREAUTH is honored', async () => {
  const pgRequireAuth = process.env.PGREQUIREAUTH
  process.env.PGREQUIREAUTH = 'md5'
  try {
    const client = new pg.Client(config)
    await assert.rejects(() => client.connect(), {
      message: 'The server requested scram-sha-256 authentication, but require_auth="md5" was set',
    })
  } finally {
    if (pgRequireAuth === undefined) {
      delete process.env.PGREQUIREAUTH
    } else {
      process.env.PGREQUIREAUTH = pgRequireAuth
    }
  }
})

/**
 * SASLprep regression coverage. RFC 5802 / RFC 4013 require the SCRAM client
 * to normalize the password (B.1 mapping → NFKC → prohibition + bidi check)
 * before feeding it into PBKDF2. PostgreSQL's server applies the same
 * SASLprep when computing the verifier, so any password whose NFKC form
 * differs from the raw form would otherwise authenticate against psql/libpq
 * but fail against pg with `28P01`.
 *
 * To exercise these tests, provision a role whose password contains an
 * NFKC-asymmetric character. For example, in psql:
 *
 *     SET password_encryption = 'scram-sha-256';
 *     CREATE ROLE scram_unicode_test LOGIN PASSWORD U&'IX-\2168';
 *
 * `\2168` is ROMAN NUMERAL IX; the server SASLprep-normalizes this to
 * `IX-IX` when computing the verifier. Then export:
 *
 *     SCRAM_TEST_PGUSER_UNICODE=scram_unicode_test
 *     SCRAM_TEST_PGPASSWORD_UNICODE='IX-\u2168'   (i.e. the raw form)
 *
 * If either env var is unset the suite is skipped, matching the convention
 * of the ASCII SCRAM block above.
 */
const unicodeConfig = {
  user: process.env.SCRAM_TEST_PGUSER_UNICODE,
  password: process.env.SCRAM_TEST_PGPASSWORD_UNICODE,
  host: process.env.SCRAM_TEST_PGHOST,
  port: process.env.SCRAM_TEST_PGPORT,
  database: process.env.SCRAM_TEST_PGDATABASE,
}

if (!unicodeConfig.user || !unicodeConfig.password) {
  suite.test('skipping SCRAM unicode tests (missing env)', () => {})
} else {
  suite.test('sasl/scram authenticates a password requiring SASLprep (raw form)', async () => {
    const client = new pg.Client(unicodeConfig)
    let usingSasl = false
    client.connection.once('authenticationSASL', () => {
      usingSasl = true
    })
    await client.connect()
    assert.ok(usingSasl, 'Should be using SASL for authentication')
    await client.end()
  })

  suite.test('sasl/scram authenticates the NFKC-equivalent ASCII form of the same password', async () => {
    // The unicode password contains a codepoint that NFKC-decomposes to ASCII
    // (e.g. U+2168 → "IX"). The server stored the verifier from the
    // SASLprep'd ASCII form, so feeding the client the ASCII form directly
    // must also authenticate. This proves that the prep step is symmetric:
    // any NFKC-equivalent representation reaches the same PBKDF2 input.
    const client = new pg.Client({
      ...unicodeConfig,
      password: unicodeConfig.password.normalize('NFKC'),
    })
    await client.connect()
    await client.end()
  })

  suite.test('sasl/scram fails when unicode password is wrong', async () => {
    const client = new pg.Client({
      ...unicodeConfig,
      password: unicodeConfig.password + 'append-something-to-make-it-bad',
    })
    let usingSasl = false
    client.connection.once('authenticationSASL', () => {
      usingSasl = true
    })
    await assert.rejects(
      () => client.connect(),
      {
        code: '28P01',
      },
      'Error code should be for a password error'
    )
    assert.ok(usingSasl, 'Should be using SASL for authentication')
  })
}
