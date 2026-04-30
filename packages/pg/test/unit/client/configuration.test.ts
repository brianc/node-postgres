import assert from 'node:assert'

import { describe, it } from 'vitest'

import { Client } from '../../_test-helper.ts'

const pguser = process.env.PGUSER || process.env.USER
const pgdatabase = process.env.PGDATABASE || process.env.USER
const pgport = process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432

describe('Client configuration', () => {
  it('defaults', () => {
    const client = new Client()
    assert.equal(client.user, pguser)
    assert.equal(client.database, pgdatabase)
    assert.equal(client.port, pgport)
    assert.equal(client.ssl, false)
  })

  it('custom', () => {
    const user = 'brian'
    const database = 'pgjstest'
    const password = 'boom'
    const client = new Client({ user, database, port: 321, password, ssl: true })

    assert.equal(client.user, user)
    assert.equal(client.database, database)
    assert.equal(client.port, 321)
    assert.equal(client.password, password)
    assert.equal(client.ssl, true)
  })

  it('custom ssl default on', () => {
    const old = process.env.PGSSLMODE
    process.env.PGSSLMODE = 'prefer'
    const client = new Client()
    process.env.PGSSLMODE = old
    assert.equal(client.ssl, true)
  })

  it('custom ssl force off', () => {
    const old = process.env.PGSSLMODE
    process.env.PGSSLMODE = 'prefer'
    const client = new Client({ ssl: false })
    process.env.PGSSLMODE = old
    assert.equal(client.ssl, false)
  })
})

describe('initializing from a config string', () => {
  it('uses connectionString property', () => {
    const client = new Client({
      connectionString: 'postgres://brian:pass@host1:333/databasename',
    })
    assert.equal(client.user, 'brian')
    assert.equal(client.password, 'pass')
    assert.equal(client.host, 'host1')
    assert.equal(client.port, 333)
    assert.equal(client.database, 'databasename')
  })

  it('uses the correct values from the config string', () => {
    const client = new Client('postgres://brian:pass@host1:333/databasename')
    assert.equal(client.user, 'brian')
    assert.equal(client.password, 'pass')
    assert.equal(client.host, 'host1')
    assert.equal(client.port, 333)
    assert.equal(client.database, 'databasename')
  })

  it('uses the correct values from the config string with space in password', () => {
    const client = new Client('postgres://brian:pass word@host1:333/databasename')
    assert.equal(client.user, 'brian')
    assert.equal(client.password, 'pass word')
    assert.equal(client.host, 'host1')
    assert.equal(client.port, 333)
    assert.equal(client.database, 'databasename')
  })

  it('when not including all values the defaults are used', () => {
    const client = new Client('postgres://host1')
    assert.equal(client.user, process.env.PGUSER || process.env.USER)
    assert.equal(client.password, process.env.PGPASSWORD || null)
    assert.equal(client.host, 'host1')
    assert.equal(client.port, process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432)
    assert.equal(client.database, process.env.PGDATABASE || process.env.USER)
  })

  it('when not including all values the environment variables are used', () => {
    const envUserDefined = process.env.PGUSER !== undefined
    const envPasswordDefined = process.env.PGPASSWORD !== undefined
    const envHostDefined = process.env.PGHOST !== undefined
    const envPortDefined = process.env.PGPORT !== undefined
    const envDBDefined = process.env.PGDATABASE !== undefined

    const savedEnvUser = process.env.PGUSER
    const savedEnvPassword = process.env.PGPASSWORD
    const savedEnvHost = process.env.PGHOST
    const savedEnvPort = process.env.PGPORT
    const savedEnvDB = process.env.PGDATABASE

    process.env.PGUSER = 'utUser1'
    process.env.PGPASSWORD = 'utPass1'
    process.env.PGHOST = 'utHost1'
    process.env.PGPORT = '5464'
    process.env.PGDATABASE = 'utDB1'

    const client = new Client('postgres://host1')
    assert.equal(client.user, process.env.PGUSER)
    assert.equal(client.password, process.env.PGPASSWORD)
    assert.equal(client.host, 'host1')
    assert.equal(String(client.port), process.env.PGPORT)
    assert.equal(client.database, process.env.PGDATABASE)

    if (envUserDefined) process.env.PGUSER = savedEnvUser
    else delete process.env.PGUSER

    if (envPasswordDefined) process.env.PGPASSWORD = savedEnvPassword
    else delete process.env.PGPASSWORD

    if (envDBDefined) process.env.PGDATABASE = savedEnvDB
    else delete process.env.PGDATABASE

    if (envHostDefined) process.env.PGHOST = savedEnvHost
    else delete process.env.PGHOST

    if (envPortDefined) process.env.PGPORT = savedEnvPort
    else delete process.env.PGPORT
  })
})

describe('calls connect correctly on connection', () => {
  it('connects to unix socket path', () => {
    const client = new Client('/tmp')
    let usedPort: string | number = ''
    let usedHost: string | undefined = ''
    ;(client.connection as unknown as { connect(p: number | string, h?: string): void }).connect = (port, host) => {
      usedPort = port
      usedHost = host
    }
    client.connect(() => {})
    assert.equal(usedPort, '/tmp/.s.PGSQL.' + pgport)
    assert.strictEqual(usedHost, undefined)
  })
})
