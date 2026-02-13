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

suite.test('can connect using sasl/scram with channel binding enabled (if using SSL)', async () => {
  const client = new pg.Client({ ...config, enableChannelBinding: true })
  let usingChannelBinding = false
  let hasPeerCert = false
  client.connection.once('authenticationSASLContinue', () => {
    hasPeerCert = client.connection.stream.getPeerCertificate === 'function'
    usingChannelBinding = client.saslSession.mechanism === 'SCRAM-SHA-256-PLUS'
  })
  await client.connect()
  assert.ok(usingChannelBinding || !hasPeerCert, 'Should be using SCRAM-SHA-256-PLUS for authentication if using SSL')
  await client.end()
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
