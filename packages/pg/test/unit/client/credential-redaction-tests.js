'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const util = require('util')

const suite = new helper.Suite()
const test = suite.test.bind(suite)

const oauthBearerToken = 'FAIL THIS OAUTH BEARER TOKEN TEST'

test('credential redaction', function () {
  test('OAuth bearer token should not exist in toString() output', () => {
    const pool = new helper.pg.Pool({ oauthBearerToken })
    const client = new helper.pg.Client({ oauthBearerToken })
    assert(pool.toString().indexOf(oauthBearerToken) === -1)
    assert(client.toString().indexOf(oauthBearerToken) === -1)
  })

  test('OAuth bearer token should not exist in util.inspect output', () => {
    const pool = new helper.pg.Pool({ oauthBearerToken })
    const client = new helper.pg.Client({ oauthBearerToken })
    const depth = 20
    assert(util.inspect(pool, { depth }).indexOf(oauthBearerToken) === -1)
    assert(util.inspect(client, { depth }).indexOf(oauthBearerToken) === -1)
  })

  test('OAuth bearer token should not exist in json.stringify output', () => {
    const pool = new helper.pg.Pool({ oauthBearerToken })
    const client = new helper.pg.Client({ oauthBearerToken })
    assert(JSON.stringify(pool).indexOf(oauthBearerToken) === -1)
    assert(JSON.stringify(client).indexOf(oauthBearerToken) === -1)
  })
})
