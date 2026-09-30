'use strict'
const helper = require('./../test-helper')
const assert = require('assert')
const suite = new helper.Suite()
const { pg } = helper

const token = process.env.OAUTH_TEST_TOKEN
const config = {
  host: process.env.OAUTH_TEST_PGHOST,
  port: process.env.OAUTH_TEST_PGPORT,
  user: process.env.OAUTH_TEST_PGUSER,
  database: process.env.OAUTH_TEST_PGDATABASE,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
}

if (helper.args.native) {
  suite.test('skipping OAuth tests (on native)', () => {})
  return
}

if (!config.user || !token) {
  suite.test('skipping OAuth tests (missing env)', () => {})
  return
}

suite.test('can connect using an OAuth bearer token', async () => {
  const client = new pg.Client({ ...config, oauthBearerToken: token })
  await client.connect()
  const result = await client.query('SELECT current_user')
  assert.equal(result.rows[0].current_user, config.user)
  await client.end()
})

suite.test('can connect using an async OAuth bearer token callback', async () => {
  let callbackCalls = 0
  const client = new pg.Client({
    ...config,
    oauthBearerToken: async (params) => {
      callbackCalls++
      assert.equal(params.user, config.user)
      assert.equal(params.database, config.database)
      return token
    },
  })

  await client.connect()
  assert.equal(callbackCalls, 1)
  await client.end()
})

suite.test('rejects an invalid OAuth bearer token', async () => {
  const client = new pg.Client({ ...config, oauthBearerToken: token + '-invalid' })
  await assert.rejects(() => client.connect(), /invalid_token/)
})
