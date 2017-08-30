'use strict'
var helper = require('./test-helper')
var pg = helper.pg

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
    database: process.env.USER,
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
    parseInputDatesAsUTC: false
  })

  var client = new pg.Client()
  assert.same(client, {
    user: process.env.USER,
    database: process.env.USER,
    password: null,
    port: 5432
  })
})

suite.test('modified values are passed to created clients', function () {
  pg.defaults.user = 'boom'
  pg.defaults.password = 'zap'
  pg.defaults.database = 'pow'
  pg.defaults.port = 1234
  pg.defaults.host = 'blam'

  var client = new Client()
  assert.same(client, {
    user: 'boom',
    password: 'zap',
    database: 'pow',
    port: 1234,
    host: 'blam'
  })
})

suite.test('cleanup', () => {
  // restore process.env
  for (var key in realEnv) {
    process.env[key] = realEnv[key]
  }
})
