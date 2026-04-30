import { describe, it, expect } from 'vitest'
import { parse } from '../src/index.ts'

const __dirname = import.meta.dirname

describe('parse', () => {
  it('using connection string in client constructor', () => {
    const subject = parse('postgres://brian:pw@boom:381/lala')
    expect(subject.user).toBe('brian')
    expect(subject.password).toBe('pw')
    expect(subject.host).toBe('boom')
    expect(subject.port).toBe('381')
    expect(subject.database).toBe('lala')
  })

  it('escape spaces if present', () => {
    const subject = parse('postgres://localhost/post gres')
    expect(subject.database).toBe('post gres')
  })

  it('do not double escape spaces', () => {
    const subject = parse('postgres://localhost/post%20gres')
    expect(subject.database).toBe('post gres')
  })

  it('initializing with unix domain socket', () => {
    const subject = parse('/const/run/')
    expect(subject.host).toBe('/const/run/')
  })

  it('initializing with unix domain socket and a specific database, the simple way', () => {
    const subject = parse('/const/run/ mydb')
    expect(subject.host).toBe('/const/run/')
    expect(subject.database).toBe('mydb')
  })

  it('initializing with unix domain socket, the health way', () => {
    const subject = parse('socket:/some path/?db=my[db]&encoding=utf8')
    expect(subject.host).toBe('/some path/')
    expect(subject.database).toBe('my[db]')
    expect(subject.client_encoding).toBe('utf8')
  })

  it('initializing with unix domain socket, the escaped health way', () => {
    const subject = parse('socket:/some%20path/?db=my%2Bdb&encoding=utf8')
    expect(subject.host).toBe('/some path/')
    expect(subject.database).toBe('my+db')
    expect(subject.client_encoding).toBe('utf8')
  })

  it('initializing with unix domain socket, username and password', () => {
    const subject = parse('socket://brian:pw@/const/run/?db=mydb')
    expect(subject.user).toBe('brian')
    expect(subject.password).toBe('pw')
    expect(subject.host).toBe('/const/run/')
    expect(subject.database).toBe('mydb')
  })

  it('password contains  < and/or >  characters', () => {
    const sourceConfig = {
      user: 'brian',
      password: 'hello<ther>e',
      host: 'localhost',
      port: 5432,
      database: 'postgres',
    }
    const connectionString =
      'postgres://' +
      sourceConfig.user +
      ':' +
      sourceConfig.password +
      '@' +
      sourceConfig.host +
      ':' +
      sourceConfig.port +
      '/' +
      sourceConfig.database
    const subject = parse(connectionString)
    expect(subject.password).toBe(sourceConfig.password)
  })

  it('password contains colons', () => {
    const sourceConfig = {
      user: 'brian',
      password: 'hello:pass:world',
      host: 'localhost',
      port: 5432,
      database: 'postgres',
    }
    const connectionString =
      'postgres://' +
      sourceConfig.user +
      ':' +
      sourceConfig.password +
      '@' +
      sourceConfig.host +
      ':' +
      sourceConfig.port +
      '/' +
      sourceConfig.database
    const subject = parse(connectionString)
    expect(subject.password).toBe(sourceConfig.password)
  })

  it('username or password contains weird characters', () => {
    const strang = 'pg://my f%irst name:is&%awesome!@localhost:9000'
    const subject = parse(strang)
    expect(subject.user).toBe('my f%irst name')
    expect(subject.password).toBe('is&%awesome!')
    expect(subject.host).toBe('localhost')
  })

  it('url is properly encoded', () => {
    const encoded = 'pg://bi%25na%25%25ry%20:s%40f%23@localhost/%20u%2520rl'
    const subject = parse(encoded)
    expect(subject.user).toBe('bi%na%%ry ')
    expect(subject.password).toBe('s@f#')
    expect(subject.host).toBe('localhost')
    expect(subject.database).toBe(' u%20rl')
  })

  it('relative url sets database', () => {
    const relative = 'different_db_on_default_host'
    const subject = parse(relative)
    expect(subject.database).toBe('different_db_on_default_host')
  })

  it('no pathname returns null database', () => {
    const subject = parse('pg://myhost')
    expect(subject.database).toBeNull()
  })

  it('pathname of "/" returns null database', () => {
    const subject = parse('pg://myhost/')
    expect(subject.host).toBe('myhost')
    expect(subject.database).toBeNull()
  })

  it('configuration parameter host', () => {
    const subject = parse('pg://user:pass@/dbname?host=/unix/socket')
    expect(subject.user).toBe('user')
    expect(subject.password).toBe('pass')
    expect(subject.host).toBe('/unix/socket')
    expect(subject.database).toBe('dbname')
  })

  it('configuration parameter host overrides url host', () => {
    const subject = parse('pg://user:pass@localhost/dbname?host=/unix/socket')
    expect(subject.database).toBe('dbname')
    expect(subject.host).toBe('/unix/socket')
  })

  it('url with encoded socket', () => {
    const subject = parse('pg://user:pass@%2Funix%2Fsocket/dbname')
    expect(subject.user).toBe('user')
    expect(subject.password).toBe('pass')
    expect(subject.host).toBe('/unix/socket')
    expect(subject.database).toBe('dbname')
  })

  it('url with real host and an encoded db name', () => {
    const subject = parse('pg://user:pass@localhost/%2Fdbname')
    expect(subject.user).toBe('user')
    expect(subject.password).toBe('pass')
    expect(subject.host).toBe('localhost')
    expect(subject.database).toBe('%2Fdbname')
  })

  it('configuration parameter host treats encoded host as part of the db name', () => {
    const subject = parse('pg://user:pass@%2Funix%2Fsocket/dbname?host=localhost')
    expect(subject.user).toBe('user')
    expect(subject.password).toBe('pass')
    expect(subject.host).toBe('localhost')
    expect(subject.database).toBe('%2Funix%2Fsocket/dbname')
  })

  it('configuration parameter application_name', () => {
    const connectionString = 'pg:///?application_name=TheApp'
    const subject = parse(connectionString)
    expect(subject.application_name).toBe('TheApp')
  })

  it('configuration parameter fallback_application_name', () => {
    const connectionString = 'pg:///?fallback_application_name=TheAppFallback'
    const subject = parse(connectionString)
    expect(subject.fallback_application_name).toBe('TheAppFallback')
  })

  it('configuration parameter options', () => {
    const connectionString = 'pg:///?options=-c geqo=off'
    const subject = parse(connectionString)
    expect(subject.options).toBe('-c geqo=off')
  })

  it('configuration parameter ssl=true', () => {
    const connectionString = 'pg:///?ssl=true'
    const subject = parse(connectionString)
    expect(subject.ssl).toBe(true)
  })

  it('configuration parameter ssl=1', () => {
    const connectionString = 'pg:///?ssl=1'
    const subject = parse(connectionString)
    expect(subject.ssl).toBe(true)
  })

  it('configuration parameter ssl=0', () => {
    const connectionString = 'pg:///?ssl=0'
    const subject = parse(connectionString)
    expect(subject.ssl).toBe(false)
  })

  it('set ssl', () => {
    const subject = parse('pg://myhost/db?ssl=1')
    expect(subject.ssl).toBe(true)
  })

  it('configuration parameter sslcert=/path/to/cert', () => {
    const connectionString = 'pg:///?sslcert=' + __dirname + '/example.cert'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({
      cert: 'example cert\n',
    })
  })

  it('configuration parameter sslkey=/path/to/key', () => {
    const connectionString = 'pg:///?sslkey=' + __dirname + '/example.key'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({
      key: 'example key\n',
    })
  })

  it('configuration parameter sslrootcert=/path/to/ca', () => {
    const connectionString = 'pg:///?sslrootcert=' + __dirname + '/example.ca'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({
      ca: 'example ca\n',
    })
  })

  it('configuration parameter sslmode=no-verify', () => {
    const connectionString = 'pg:///?sslmode=no-verify'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=disable', () => {
    const connectionString = 'pg:///?sslmode=disable'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual(false)
  })

  it('configuration parameter sslmode=prefer', () => {
    const connectionString = 'pg:///?sslmode=prefer'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({})
  })

  it('configuration parameter sslmode=require', () => {
    const connectionString = 'pg:///?sslmode=require'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({})
  })

  it('configuration parameter sslmode=verify-ca', () => {
    const connectionString = 'pg:///?sslmode=verify-ca'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({})
  })

  it('configuration parameter sslmode=verify-full', () => {
    const connectionString = 'pg:///?sslmode=verify-full'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({})
  })

  it('configuration parameter ssl=true and sslmode=require still work with sslrootcert=/path/to/ca', () => {
    const connectionString = 'pg:///?ssl=true&sslrootcert=' + __dirname + '/example.ca&sslmode=require'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({
      ca: 'example ca\n',
    })
  })

  it('configuration parameter sslmode=disable with uselibpqcompat query param', () => {
    const connectionString = 'pg:///?sslmode=disable&uselibpqcompat=true'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual(false)
  })

  it('configuration parameter sslmode=prefer with uselibpqcompat query param', () => {
    const connectionString = 'pg:///?sslmode=prefer&uselibpqcompat=true'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=require with uselibpqcompat query param', () => {
    const connectionString = 'pg:///?sslmode=require&uselibpqcompat=true'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=verify-ca with uselibpqcompat query param', () => {
    const connectionString = 'pg:///?sslmode=verify-ca&uselibpqcompat=true'
    expect(() => {
      parse(connectionString)
    }).toThrow()
  })

  it('when throwing on invalid url does not print out the password in the error message', () => {
    const host = 'localhost'
    const port = 5432
    const user = 'user'
    const password = 'g#4624$@F$#v`'
    const database = 'db'

    const connectionString = `postgres://${user}:${password}@${host}:${port}/${database}`
    expect(() => {
      parse(connectionString)
    }).toThrow()
    try {
      parse(connectionString)
    } catch (err: unknown) {
      expect(JSON.stringify(err)).not.toContain(password)
      expect(JSON.stringify(err)).toContain('REDACTED')
      return
    }
    throw new Error('Expected an error to be thrown')
  })

  it('configuration parameter sslmode=verify-ca and sslrootcert with uselibpqcompat query param', () => {
    const connectionString = 'pg:///?sslmode=verify-ca&uselibpqcompat=true&sslrootcert=' + __dirname + '/example.ca'
    const subject = parse(connectionString)
    const ssl = subject.ssl as { checkServerIdentity: () => undefined }
    expect(typeof ssl.checkServerIdentity).toBe('function')
    expect(ssl.checkServerIdentity()).toBeUndefined()
  })

  it('configuration parameter sslmode=verify-full with uselibpqcompat query param', () => {
    const connectionString = 'pg:///?sslmode=verify-full&uselibpqcompat=true'
    const subject = parse(connectionString)
    expect(subject.ssl).toEqual({})
  })

  it('configuration parameter ssl=true and sslmode=require still work with sslrootcert=/path/to/ca with uselibpqcompat query param', () => {
    const connectionString =
      'pg:///?ssl=true&sslrootcert=' + __dirname + '/example.ca&sslmode=require&uselibpqcompat=true'
    const subject = parse(connectionString)
    const ssl = subject.ssl as { ca: string; checkServerIdentity: () => undefined }
    expect(ssl.ca).toBe('example ca\n')
    expect(typeof ssl.checkServerIdentity).toBe('function')
    expect(ssl.checkServerIdentity()).toBeUndefined()
  })

  it('configuration parameter sslmode=disable with useLibpqCompat option', () => {
    const connectionString = 'pg:///?sslmode=disable'
    const subject = parse(connectionString, { useLibpqCompat: true })
    expect(subject.ssl).toEqual(false)
  })

  it('configuration parameter sslmode=prefer with useLibpqCompat option', () => {
    const connectionString = 'pg:///?sslmode=prefer'
    const subject = parse(connectionString, { useLibpqCompat: true })
    expect(subject.ssl).toEqual({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=require with useLibpqCompat option', () => {
    const connectionString = 'pg:///?sslmode=require'
    const subject = parse(connectionString, { useLibpqCompat: true })
    expect(subject.ssl).toEqual({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=verify-ca with useLibpqCompat option', () => {
    const connectionString = 'pg:///?sslmode=verify-ca'
    expect(() => {
      parse(connectionString, { useLibpqCompat: true })
    }).toThrow()
  })

  it('configuration parameter sslmode=verify-ca and sslrootcert with useLibpqCompat option', () => {
    const connectionString = 'pg:///?sslmode=verify-ca&sslrootcert=' + __dirname + '/example.ca'
    const subject = parse(connectionString, { useLibpqCompat: true })
    const ssl = subject.ssl as { checkServerIdentity: () => undefined }
    expect(typeof ssl.checkServerIdentity).toBe('function')
    expect(ssl.checkServerIdentity()).toBeUndefined()
  })

  it('configuration parameter sslmode=verify-full with useLibpqCompat option', () => {
    const connectionString = 'pg:///?sslmode=verify-full'
    const subject = parse(connectionString, { useLibpqCompat: true })
    expect(subject.ssl).toEqual({})
  })

  it('configuration parameter ssl=true and sslmode=require still work with sslrootcert=/path/to/ca with useLibpqCompat option', () => {
    const connectionString = 'pg:///?ssl=true&sslrootcert=' + __dirname + '/example.ca&sslmode=require'
    const subject = parse(connectionString, { useLibpqCompat: true })
    const ssl = subject.ssl as { ca: string; checkServerIdentity: () => undefined }
    expect(ssl.ca).toBe('example ca\n')
    expect(typeof ssl.checkServerIdentity).toBe('function')
    expect(ssl.checkServerIdentity()).toBeUndefined()
  })

  it('does not allow uselibpqcompat query parameter and useLibpqCompat option at the same time', () => {
    const connectionString = 'pg:///?uselibpqcompat=true'
    expect(() => {
      parse(connectionString, { useLibpqCompat: true })
    }).toThrow()
  })

  it('allow other params like max, ...', () => {
    const subject = parse('pg://myhost/db?max=18&min=4')
    expect(subject.max).toBe('18')
    expect(subject.min).toBe('4')
  })

  it('configuration parameter keepalives', () => {
    const connectionString = 'pg:///?keepalives=1'
    const subject = parse(connectionString)
    expect(subject.keepalives).toBe('1')
  })

  it('unknown configuration parameter is passed into client', () => {
    const connectionString = 'pg:///?ThereIsNoSuchPostgresParameter=1234'
    const subject = parse(connectionString)
    expect(subject.ThereIsNoSuchPostgresParameter).toBe('1234')
  })

  it('do not override a config field with value from query string', () => {
    const subject = parse('socket:/some path/?db=my[db]&encoding=utf8&client_encoding=bogus')
    expect(subject.host).toBe('/some path/')
    expect(subject.database).toBe('my[db]')
    expect(subject.client_encoding).toBe('utf8')
  })

  it('return last value of repeated parameter', () => {
    const connectionString = 'pg:///?keepalives=1&keepalives=0'
    const subject = parse(connectionString)
    expect(subject.keepalives).toBe('0')
  })

  it('use the port specified in the query parameters', () => {
    const connectionString = 'postgres:///?host=localhost&port=1234'
    const subject = parse(connectionString)
    expect(subject.port).toBe('1234')
  })
})
