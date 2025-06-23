'use strict'
const helper = require('./test-helper')
const { Client } = helper
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

const pguser = process.env['PGUSER'] || process.env.USER
const pgdatabase = process.env['PGDATABASE'] || process.env.USER
const pgport = process.env['PGPORT'] || 5432

test('client settings', function () {
  test('defaults', function () {
    const client = new Client()
    assert.equal(client.user, pguser)
    assert.equal(client.database, pgdatabase)
    assert.equal(client.port, pgport)
    assert.equal(client.ssl, false)
  })

  test('custom', function () {
    const user = 'brian'
    const database = 'pgjstest'
    const password = 'boom'
    const client = new Client({
      user: user,
      database: database,
      port: 321,
      password: password,
      ssl: true,
    })

    assert.equal(client.user, user)
    assert.equal(client.database, database)
    assert.equal(client.port, 321)
    assert.equal(client.password, password)
    assert.equal(client.ssl, true)
  })

  test('custom ssl default on', function () {
    const old = process.env.PGSSLMODE
    process.env.PGSSLMODE = 'prefer'

    const client = new Client()
    process.env.PGSSLMODE = old

    assert.equal(client.ssl, true)
  })

  test('custom ssl force off', function () {
    const old = process.env.PGSSLMODE
    process.env.PGSSLMODE = 'prefer'

    const client = new Client({
      ssl: false,
    })
    process.env.PGSSLMODE = old

    assert.equal(client.ssl, false)
  })
})

test('initializing from a config string', function () {
  test('uses connectionString property', function () {
    const client = new Client({
      connectionString: 'postgres://brian:pass@host1:333/databasename',
    })
    assert.equal(client.user, 'brian')
    assert.equal(client.password, 'pass')
    assert.equal(client.host, 'host1')
    assert.equal(client.port, 333)
    assert.equal(client.database, 'databasename')
  })

  test('uses the correct values from the config string', function () {
    const client = new Client('postgres://brian:pass@host1:333/databasename')
    assert.equal(client.user, 'brian')
    assert.equal(client.password, 'pass')
    assert.equal(client.host, 'host1')
    assert.equal(client.port, 333)
    assert.equal(client.database, 'databasename')
  })

  test('uses the correct values from the config string with space in password', function () {
    const client = new Client('postgres://brian:pass word@host1:333/databasename')
    assert.equal(client.user, 'brian')
    assert.equal(client.password, 'pass word')
    assert.equal(client.host, 'host1')
    assert.equal(client.port, 333)
    assert.equal(client.database, 'databasename')
  })

  test('when not including all values the defaults are used', function () {
    const client = new Client('postgres://host1')
    assert.equal(client.user, process.env['PGUSER'] || process.env.USER)
    assert.equal(client.password, process.env['PGPASSWORD'] || null)
    assert.equal(client.host, 'host1')
    assert.equal(client.port, process.env['PGPORT'] || 5432)
    assert.equal(client.database, process.env['PGDATABASE'] || process.env.USER)
  })

  test('when not including all values the environment variables are used', function () {
    const envUserDefined = process.env['PGUSER'] !== undefined
    const envPasswordDefined = process.env['PGPASSWORD'] !== undefined
    const envHostDefined = process.env['PGHOST'] !== undefined
    const envPortDefined = process.env['PGPORT'] !== undefined
    const envDBDefined = process.env['PGDATABASE'] !== undefined

    const savedEnvUser = process.env['PGUSER']
    const savedEnvPassword = process.env['PGPASSWORD']
    const savedEnvHost = process.env['PGHOST']
    const savedEnvPort = process.env['PGPORT']
    const savedEnvDB = process.env['PGDATABASE']

    process.env['PGUSER'] = 'utUser1'
    process.env['PGPASSWORD'] = 'utPass1'
    process.env['PGHOST'] = 'utHost1'
    process.env['PGPORT'] = 5464
    process.env['PGDATABASE'] = 'utDB1'

    const client = new Client('postgres://host1')
    assert.equal(client.user, process.env['PGUSER'])
    assert.equal(client.password, process.env['PGPASSWORD'])
    assert.equal(client.host, 'host1')
    assert.equal(client.port, process.env['PGPORT'])
    assert.equal(client.database, process.env['PGDATABASE'])

    if (envUserDefined) {
      process.env['PGUSER'] = savedEnvUser
    } else {
      delete process.env['PGUSER']
    }

    if (envPasswordDefined) {
      process.env['PGPASSWORD'] = savedEnvPassword
    } else {
      delete process.env['PGPASSWORD']
    }

    if (envDBDefined) {
      process.env['PGDATABASE'] = savedEnvDB
    } else {
      delete process.env['PGDATABASE']
    }

    if (envHostDefined) {
      process.env['PGHOST'] = savedEnvHost
    } else {
      delete process.env['PGHOST']
    }

    if (envPortDefined) {
      process.env['PGPORT'] = savedEnvPort
    } else {
      delete process.env['PGPORT']
    }
  })
})

test('calls connect correctly on connection', function () {
  const client = new Client('/tmp')
  let usedPort = ''
  let usedHost = ''
  client.connection.connect = function (port, host) {
    usedPort = port
    usedHost = host
  }
  client.connect()
  assert.equal(usedPort, '/tmp/.s.PGSQL.' + pgport)
  assert.strictEqual(usedHost, undefined)
})
