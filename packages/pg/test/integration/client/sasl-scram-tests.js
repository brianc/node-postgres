'use strict'
const helper = require('./../test-helper')
const pg = helper.pg
const suite = new helper.Suite()
const { native } = helper.args

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
  suite.testAsync('skipping SCRAM tests (on native)', () => {})
  return
}
if (!config.user || !config.password) {
  suite.testAsync('skipping SCRAM tests (missing env)', () => {})
  return
}

suite.testAsync('can connect using sasl/scram', async () => {
  const client = new pg.Client(config)
  let usingSasl = false
  client.connection.once('authenticationSASL', () => {
    usingSasl = true
  })
  await client.connect()
  assert.ok(usingSasl, 'Should be using SASL for authentication')
  await client.end()
})

suite.testAsync('sasl/scram fails when password is wrong', async () => {
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
