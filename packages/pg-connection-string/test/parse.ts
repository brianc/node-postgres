import assert from 'assert'
import { parse } from '../'

describe('parse', function () {
  it('using connection string in client constructor', function () {
    const subject = parse('postgres://brian:pw@boom:381/lala')
    assert.strictEqual(subject.user, 'brian')
    assert.strictEqual(subject.password, 'pw')
    assert.strictEqual(subject.host, 'boom')
    assert.strictEqual(subject.port, '381')
    assert.strictEqual(subject.database, 'lala')
  })

  it('escape spaces if present', function () {
    const subject = parse('postgres://localhost/post gres')
    assert.strictEqual(subject.database, 'post gres')
  })

  it('do not double escape spaces', function () {
    const subject = parse('postgres://localhost/post%20gres')
    assert.strictEqual(subject.database, 'post gres')
  })

  it('initializing with unix domain socket', function () {
    const subject = parse('/var/run/')
    assert.strictEqual(subject.host, '/var/run/')
  })

  it('initializing with unix domain socket and a specific database, the simple way', function () {
    const subject = parse('/var/run/ mydb')
    assert.strictEqual(subject.host, '/var/run/')
    assert.strictEqual(subject.database, 'mydb')
  })

  it('initializing with unix domain socket, the health way', function () {
    const subject = parse('socket:/some path/?db=my[db]&encoding=utf8')
    assert.strictEqual(subject.host, '/some path/')
    assert.strictEqual(subject.database, 'my[db]', 'must to be escaped and unescaped trough "my%5Bdb%5D"')
    assert.strictEqual(subject.client_encoding, 'utf8')
  })

  it('initializing with unix domain socket, the escaped health way', function () {
    const subject = parse('socket:/some%20path/?db=my%2Bdb&encoding=utf8')
    assert.strictEqual(subject.host, '/some path/')
    assert.strictEqual(subject.database, 'my+db')
    assert.strictEqual(subject.client_encoding, 'utf8')
  })

  it('initializing with unix domain socket, username and password', function () {
    const subject = parse('socket://brian:pw@/var/run/?db=mydb')
    assert.strictEqual(subject.user, 'brian')
    assert.strictEqual(subject.password, 'pw')
    assert.strictEqual(subject.host, '/var/run/')
    assert.strictEqual(subject.database, 'mydb')
  })

  it('password contains  < and/or >  characters', function () {
    const sourceConfig = {
      user: 'brian',
      password: 'hello<ther>e',
      port: 5432,
      host: 'localhost',
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
    assert.strictEqual(subject.password, sourceConfig.password)
  })

  it('password contains colons', function () {
    const sourceConfig = {
      user: 'brian',
      password: 'hello:pass:world',
      port: 5432,
      host: 'localhost',
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
    assert.strictEqual(subject.password, sourceConfig.password)
  })

  it('username or password contains weird characters', function () {
    const strang = 'pg://my f%irst name:is&%awesome!@localhost:9000'
    const subject = parse(strang)
    assert.strictEqual(subject.user, 'my f%irst name')
    assert.strictEqual(subject.password, 'is&%awesome!')
    assert.strictEqual(subject.host, 'localhost')
  })

  it('url is properly encoded', function () {
    const encoded = 'pg://bi%25na%25%25ry%20:s%40f%23@localhost/%20u%2520rl'
    const subject = parse(encoded)
    assert.strictEqual(subject.user, 'bi%na%%ry ')
    assert.strictEqual(subject.password, 's@f#')
    assert.strictEqual(subject.host, 'localhost')
    assert.strictEqual(subject.database, ' u%20rl')
  })

  it('relative url sets database', function () {
    const relative = 'different_db_on_default_host'
    const subject = parse(relative)
    assert.strictEqual(subject.database, 'different_db_on_default_host')
  })

  it('no pathname returns null database', function () {
    const subject = parse('pg://myhost')
    assert.strictEqual(subject.database === null, true)
  })

  it('pathname of "/" returns null database', function () {
    var subject = parse('pg://myhost/')
    assert.strictEqual(subject.host, 'myhost')
    assert.strictEqual(subject.database === null, true)
  })

  it('configuration parameter host', function () {
    const subject = parse('pg://user:pass@/dbname?host=/unix/socket')
    assert.strictEqual(subject.user, 'user')
    assert.strictEqual(subject.password, 'pass')
    assert.strictEqual(subject.host, '/unix/socket')
    assert.strictEqual(subject.database, 'dbname')
  })

  it('configuration parameter host overrides url host', function () {
    const subject = parse('pg://user:pass@localhost/dbname?host=/unix/socket')
    assert.strictEqual(subject.host, '/unix/socket')
  })

  it('url with encoded socket', function () {
    const subject = parse('pg://user:pass@%2Funix%2Fsocket/dbname')
    assert.strictEqual(subject.user, 'user')
    assert.strictEqual(subject.password, 'pass')
    assert.strictEqual(subject.host, '/unix/socket')
    assert.strictEqual(subject.database, 'dbname')
  })

  it('url with real host and an encoded db name', function () {
    const subject = parse('pg://user:pass@localhost/%2Fdbname')
    assert.strictEqual(subject.user, 'user')
    assert.strictEqual(subject.password, 'pass')
    assert.strictEqual(subject.host, 'localhost')
    assert.strictEqual(subject.database, '%2Fdbname')
  })

  it('configuration parameter host treats encoded socket as part of the db name', function () {
    const subject = parse('pg://user:pass@%2Funix%2Fsocket/dbname?host=localhost')
    assert.strictEqual(subject.user, 'user')
    assert.strictEqual(subject.password, 'pass')
    assert.strictEqual(subject.host, 'localhost')
    assert.strictEqual(subject.database, '%2Funix%2Fsocket/dbname')
  })

  it('configuration parameter application_name', function () {
    const connectionString = 'pg:///?application_name=TheApp'
    const subject = parse(connectionString)
    assert.strictEqual(subject.application_name, 'TheApp')
  })

  it('configuration parameter fallback_application_name', function () {
    const connectionString = 'pg:///?fallback_application_name=TheAppFallback'
    const subject = parse(connectionString)
    assert.strictEqual(subject.fallback_application_name, 'TheAppFallback')
  })

  it('configuration parameter options', function () {
    const connectionString = 'pg:///?options=-c geqo=off'
    const subject = parse(connectionString)
    assert.strictEqual(subject.options, '-c geqo=off')
  })

  it('configuration parameter ssl=true', function () {
    const connectionString = 'pg:///?ssl=true'
    const subject = parse(connectionString)
    assert.strictEqual(subject.ssl, true)
  })

  it('configuration parameter ssl=1', function () {
    const connectionString = 'pg:///?ssl=1'
    const subject = parse(connectionString)
    assert.strictEqual(subject.ssl, true)
  })

  it('configuration parameter ssl=0', function () {
    const connectionString = 'pg:///?ssl=0'
    const subject = parse(connectionString)
    assert.strictEqual(subject.ssl, false)
  })

  it('set ssl', function () {
    const subject = parse('pg://myhost/db?ssl=1')
    assert.strictEqual(subject.ssl, true)
  })

  it('configuration parameter sslcert=/path/to/cert', function () {
    const connectionString = 'pg:///?sslcert=' + __dirname + '/example.cert'
    const subject = parse(connectionString)
    assert.deepStrictEqual(subject.ssl, {
      cert: 'example cert\n',
    })
  })

  it('configuration parameter sslkey=/path/to/key', function () {
    const connectionString = 'pg:///?sslkey=' + __dirname + '/example.key'
    const subject = parse(connectionString)
    assert.deepStrictEqual(subject.ssl, {
      key: 'example key\n',
    })
  })

  it('configuration parameter sslrootcert=/path/to/ca', function () {
    const connectionString = 'pg:///?sslrootcert=' + __dirname + '/example.ca'
    const subject = parse(connectionString)
    assert.deepStrictEqual(subject.ssl, {
      ca: 'example ca\n',
    })
  })

  it('configuration parameter sslmode=no-verify', function () {
    const connectionString = 'pg:///?sslmode=no-verify'
    const subject = parse(connectionString)
    assert.deepStrictEqual(subject.ssl, {
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=disable', function () {
    const connectionString = 'pg:///?sslmode=disable'
    const subject = parse(connectionString)
    assert.strictEqual(subject.ssl, false)
  }),
    it('configuration parameter sslmode=prefer', function () {
      const connectionString = 'pg:///?sslmode=prefer'
      const subject = parse(connectionString)
      assert.deepStrictEqual(subject.ssl, {})
    })

  it('configuration parameter sslmode=require', function () {
    const connectionString = 'pg:///?sslmode=require'
    const subject = parse(connectionString)
    assert.deepStrictEqual(subject.ssl, {})
  })

  it('configuration parameter sslmode=verify-ca', function () {
    const connectionString = 'pg:///?sslmode=verify-ca'
    const subject = parse(connectionString)
    assert.deepStrictEqual(subject.ssl, {})
  })

  it('configuration parameter sslmode=verify-full', function () {
    const connectionString = 'pg:///?sslmode=verify-full'
    const subject = parse(connectionString)
    assert.deepStrictEqual(subject.ssl, {})
  })

  it('configuration parameter ssl=true and sslmode=require still work with sslrootcert=/path/to/ca', function () {
    const connectionString = 'pg:///?ssl=true&sslrootcert=' + __dirname + '/example.ca&sslmode=require'
    const subject = parse(connectionString)
    assert.deepStrictEqual(subject.ssl, {
      ca: 'example ca\n',
    })
  })

  it('allow other params like max, ...', function () {
    const subject = parse('pg://myhost/db?max=18&min=4')
    assert.strictEqual(subject.max, '18')
    assert.strictEqual(subject.min, '4')
  })

  it('configuration parameter keepalives', function () {
    const connectionString = 'pg:///?keepalives=1'
    const subject = parse(connectionString)
    assert.strictEqual(subject.keepalives, '1')
  })

  it('unknown configuration parameter is passed into client', function () {
    const connectionString = 'pg:///?ThereIsNoSuchPostgresParameter=1234'
    const subject = parse(connectionString)
    assert.strictEqual(subject.ThereIsNoSuchPostgresParameter, '1234')
  })

  it('do not override a config field with value from query string', function () {
    const subject = parse('socket:/some path/?db=my[db]&encoding=utf8&client_encoding=bogus')
    assert.strictEqual(subject.host, '/some path/')
    assert.strictEqual(subject.database, 'my[db]', 'must to be escaped and unescaped through "my%5Bdb%5D"')
    assert.strictEqual(subject.client_encoding, 'utf8')
  })

  it('return last value of repeated parameter', function () {
    const connectionString = 'pg:///?keepalives=1&keepalives=0'
    const subject = parse(connectionString)
    assert.strictEqual(subject.keepalives, '0')
  })
})
