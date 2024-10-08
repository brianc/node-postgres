'use strict'
var helper = require('./test-helper')
var pg = helper.pg
const assert = require('assert')
const { Client } = helper

var suite = new helper.Suite()

// clear process.env
var realEnv = {}
for (var key in process.env) {
  realEnv[key] = process.env[key]
  if (!key.indexOf('PG')) delete process.env[key]
}

suite.test('default values are used in new clients', function () {
  assert.same(pg.defaults, {
    user: process.env.USER,
    database: undefined,
    password: null,
    port: 5432,
    rows: 0,
    max: 10,
    binary: false,
    idleTimeoutMillis: 30000,
    client_encoding: '',
    ssl: false,
    application_name: undefined,
    fallback_application_name: undefined,
    parseInputDatesAsUTC: false,
  })

  var client = new pg.Client()
  assert.same(client, {
    user: process.env.USER,
    password: null,
    port: 5432,
    database: process.env.USER,
  })
})

suite.test('modified values are passed to created clients', function () {
  pg.defaults.user = 'boom'
  pg.defaults.password = 'zap'
  pg.defaults.host = 'blam'
  pg.defaults.port = 1234
  pg.defaults.database = 'pow'

  var client = new Client()
  assert.same(client, {
    user: 'boom',
    password: 'zap',
    host: 'blam',
    port: 1234,
    database: 'pow',
  })
})

suite.test('database defaults to user when user is non-default', () => {
  {
    pg.defaults.database = undefined

    const client = new Client({
      user: 'foo',
    })

    assert.strictEqual(client.database, 'foo')
  }

  {
    pg.defaults.database = 'bar'

    const client = new Client({
      user: 'foo',
    })

    assert.strictEqual(client.database, 'bar')
  }
})

suite.test('cleanup', () => {
  // restore process.env
  for (var key in realEnv) {
    process.env[key] = realEnv[key]
  }
})
