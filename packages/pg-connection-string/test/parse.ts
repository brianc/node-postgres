import chai from 'chai'
const expect = chai.expect
chai.should()

import { parse } from '../'

describe('parse', function () {
  it('using connection string in client constructor', function () {
    const subject = parse('postgres://brian:pw@boom:381/lala')
    subject.user?.should.equal('brian')
    subject.password?.should.equal('pw')
    subject.host?.should.equal('boom')
    subject.port?.should.equal('381')
    subject.database?.should.equal('lala')
  })

  it('escape spaces if present', function () {
    const subject = parse('postgres://localhost/post gres')
    subject.database?.should.equal('post gres')
  })

  it('do not double escape spaces', function () {
    const subject = parse('postgres://localhost/post%20gres')
    subject.database?.should.equal('post gres')
  })

  it('initializing with unix domain socket', function () {
    const subject = parse('/const/run/')
    subject.host?.should.equal('/const/run/')
  })

  it('initializing with unix domain socket and a specific database, the simple way', function () {
    const subject = parse('/const/run/ mydb')
    subject.host?.should.equal('/const/run/')
    subject.database?.should.equal('mydb')
  })

  it('initializing with unix domain socket, the health way', function () {
    const subject = parse('socket:/some path/?db=my[db]&encoding=utf8')
    subject.host?.should.equal('/some path/')
    subject.database?.should.equal('my[db]', 'must to be escaped and unescaped trough "my%5Bdb%5D"')
    subject.client_encoding?.should.equal('utf8')
  })

  it('initializing with unix domain socket, the escaped health way', function () {
    const subject = parse('socket:/some%20path/?db=my%2Bdb&encoding=utf8')
    subject.host?.should.equal('/some path/')
    subject.database?.should.equal('my+db')
    subject.client_encoding?.should.equal('utf8')
  })

  it('initializing with unix domain socket, username and password', function () {
    const subject = parse('socket://brian:pw@/const/run/?db=mydb')
    subject.user?.should.equal('brian')
    subject.password?.should.equal('pw')
    subject.host?.should.equal('/const/run/')
    subject.database?.should.equal('mydb')
  })

  it('password contains  < and/or >  characters', function () {
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
    subject.password?.should.equal(sourceConfig.password)
  })

  it('password contains colons', function () {
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
    subject.password?.should.equal(sourceConfig.password)
  })

  it('username or password contains weird characters', function () {
    const strang = 'pg://my f%irst name:is&%awesome!@localhost:9000'
    const subject = parse(strang)
    subject.user?.should.equal('my f%irst name')
    subject.password?.should.equal('is&%awesome!')
    subject.host?.should.equal('localhost')
  })

  it('url is properly encoded', function () {
    const encoded = 'pg://bi%25na%25%25ry%20:s%40f%23@localhost/%20u%2520rl'
    const subject = parse(encoded)
    subject.user?.should.equal('bi%na%%ry ')
    subject.password?.should.equal('s@f#')
    subject.host?.should.equal('localhost')
    subject.database?.should.equal(' u%20rl')
  })

  it('relative url sets database', function () {
    const relative = 'different_db_on_default_host'
    const subject = parse(relative)
    subject.database?.should.equal('different_db_on_default_host')
  })

  it('no pathname returns null database', function () {
    const subject = parse('pg://myhost')
    ;(subject.database === null).should.equal(true)
  })

  it('pathname of "/" returns null database', function () {
    const subject = parse('pg://myhost/')
    subject.host?.should.equal('myhost')
    ;(subject.database === null).should.equal(true)
  })

  it('configuration parameter host', function () {
    const subject = parse('pg://user:pass@/dbname?host=/unix/socket')
    subject.user?.should.equal('user')
    subject.password?.should.equal('pass')
    subject.host?.should.equal('/unix/socket')
    subject.database?.should.equal('dbname')
  })

  it('configuration parameter host overrides url host', function () {
    const subject = parse('pg://user:pass@localhost/dbname?host=/unix/socket')
    subject.database?.should.equal('dbname')
    subject.host?.should.equal('/unix/socket')
  })

  it('url with encoded socket', function () {
    const subject = parse('pg://user:pass@%2Funix%2Fsocket/dbname')
    subject.user?.should.equal('user')
    subject.password?.should.equal('pass')
    subject.host?.should.equal('/unix/socket')
    subject.database?.should.equal('dbname')
  })

  it('url with real host and an encoded db name', function () {
    const subject = parse('pg://user:pass@localhost/%2Fdbname')
    subject.user?.should.equal('user')
    subject.password?.should.equal('pass')
    subject.host?.should.equal('localhost')
    subject.database?.should.equal('%2Fdbname')
  })

  it('configuration parameter host treats encoded host as part of the db name', function () {
    const subject = parse('pg://user:pass@%2Funix%2Fsocket/dbname?host=localhost')
    subject.user?.should.equal('user')
    subject.password?.should.equal('pass')
    subject.host?.should.equal('localhost')
    subject.database?.should.equal('%2Funix%2Fsocket/dbname')
  })

  it('configuration parameter application_name', function () {
    const connectionString = 'pg:///?application_name=TheApp'
    const subject = parse(connectionString)
    subject.application_name?.should.equal('TheApp')
  })

  it('configuration parameter fallback_application_name', function () {
    const connectionString = 'pg:///?fallback_application_name=TheAppFallback'
    const subject = parse(connectionString)
    subject.fallback_application_name?.should.equal('TheAppFallback')
  })

  it('configuration parameter options', function () {
    const connectionString = 'pg:///?options=-c geqo=off'
    const subject = parse(connectionString)
    subject.options?.should.equal('-c geqo=off')
  })

  it('configuration parameter ssl=true', function () {
    const connectionString = 'pg:///?ssl=true'
    const subject = parse(connectionString)
    subject.ssl?.should.equal(true)
  })

  it('configuration parameter ssl=1', function () {
    const connectionString = 'pg:///?ssl=1'
    const subject = parse(connectionString)
    subject.ssl?.should.equal(true)
  })

  it('configuration parameter ssl=0', function () {
    const connectionString = 'pg:///?ssl=0'
    const subject = parse(connectionString)
    subject.ssl?.should.equal(false)
  })

  it('set ssl', function () {
    const subject = parse('pg://myhost/db?ssl=1')
    subject.ssl?.should.equal(true)
  })

  it('configuration parameter sslcert=/path/to/cert', function () {
    const connectionString = 'pg:///?sslcert=' + __dirname + '/example.cert'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({
      cert: 'example cert\n',
    })
  })

  it('configuration parameter sslkey=/path/to/key', function () {
    const connectionString = 'pg:///?sslkey=' + __dirname + '/example.key'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({
      key: 'example key\n',
    })
  })

  it('configuration parameter sslrootcert=/path/to/ca', function () {
    const connectionString = 'pg:///?sslrootcert=' + __dirname + '/example.ca'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({
      ca: 'example ca\n',
    })
  })

  it('configuration parameter sslmode=no-verify', function () {
    const connectionString = 'pg:///?sslmode=no-verify'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=disable', function () {
    const connectionString = 'pg:///?sslmode=disable'
    const subject = parse(connectionString)
    subject.ssl?.should.eql(false)
  })

  it('configuration parameter sslmode=prefer', function () {
    const connectionString = 'pg:///?sslmode=prefer'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({})
  })

  it('configuration parameter sslmode=require', function () {
    const connectionString = 'pg:///?sslmode=require'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({})
  })

  it('configuration parameter sslmode=verify-ca', function () {
    const connectionString = 'pg:///?sslmode=verify-ca'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({})
  })

  it('configuration parameter sslmode=verify-full', function () {
    const connectionString = 'pg:///?sslmode=verify-full'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({})
  })

  it('configuration parameter ssl=true and sslmode=require still work with sslrootcert=/path/to/ca', function () {
    const connectionString = 'pg:///?ssl=true&sslrootcert=' + __dirname + '/example.ca&sslmode=require'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({
      ca: 'example ca\n',
    })
  })

  it('configuration parameter sslmode=disable with uselibpqcompat query param', function () {
    const connectionString = 'pg:///?sslmode=disable&uselibpqcompat=true'
    const subject = parse(connectionString)
    subject.ssl?.should.eql(false)
  })

  it('configuration parameter sslmode=prefer with uselibpqcompat query param', function () {
    const connectionString = 'pg:///?sslmode=prefer&uselibpqcompat=true'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=require with uselibpqcompat query param', function () {
    const connectionString = 'pg:///?sslmode=require&uselibpqcompat=true'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=verify-ca with uselibpqcompat query param', function () {
    const connectionString = 'pg:///?sslmode=verify-ca&uselibpqcompat=true'
    expect(function () {
      parse(connectionString)
    }).to.throw()
  })

  it('when throwing on invalid url does not print out the password in the error message', function () {
    const host = 'localhost'
    const port = 5432
    const user = 'user'
    const password = 'g#4624$@F$#v`'
    const database = 'db'

    const connectionString = `postgres://${user}:${password}@${host}:${port}/${database}`
    expect(function () {
      parse(connectionString)
    }).to.throw()
    try {
      parse(connectionString)
    } catch (err: unknown) {
      expect(JSON.stringify(err)).to.not.include(password, 'Password should not be in the error message')
      return
    }
    throw new Error('Expected an error to be thrown')
  })

  it('configuration parameter sslmode=verify-ca and sslrootcert with uselibpqcompat query param', function () {
    const connectionString = 'pg:///?sslmode=verify-ca&uselibpqcompat=true&sslrootcert=' + __dirname + '/example.ca'
    const subject = parse(connectionString)
    subject.ssl?.should.have.property('checkServerIdentity').that.is.a('function')
    // We prove above that the checkServerIdentity function is defined
    //
    // FIXME: remove this if we upgrade to TypeScript 5
    // @ts-ignore
    expect(subject.ssl.checkServerIdentity()).be.undefined
  })

  it('configuration parameter sslmode=verify-full with uselibpqcompat query param', function () {
    const connectionString = 'pg:///?sslmode=verify-full&uselibpqcompat=true'
    const subject = parse(connectionString)
    subject.ssl?.should.eql({})
  })

  it('configuration parameter ssl=true and sslmode=require still work with sslrootcert=/path/to/ca with uselibpqcompat query param', function () {
    const connectionString =
      'pg:///?ssl=true&sslrootcert=' + __dirname + '/example.ca&sslmode=require&uselibpqcompat=true'
    const subject = parse(connectionString)
    subject.ssl?.should.have.property('ca', 'example ca\n')
    subject.ssl?.should.have.property('checkServerIdentity').that.is.a('function')
    // We prove above that the checkServerIdentity function is defined
    //
    // FIXME: remove this if we upgrade to TypeScript 5
    // @ts-ignore
    expect(subject.ssl?.checkServerIdentity()).be.undefined
  })

  it('configuration parameter sslmode=disable with useLibpqCompat option', function () {
    const connectionString = 'pg:///?sslmode=disable'
    const subject = parse(connectionString, { useLibpqCompat: true })
    subject.ssl?.should.eql(false)
  })

  it('configuration parameter sslmode=prefer with useLibpqCompat option', function () {
    const connectionString = 'pg:///?sslmode=prefer'
    const subject = parse(connectionString, { useLibpqCompat: true })
    subject.ssl?.should.eql({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=require with useLibpqCompat option', function () {
    const connectionString = 'pg:///?sslmode=require'
    const subject = parse(connectionString, { useLibpqCompat: true })
    subject.ssl?.should.eql({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=verify-ca with useLibpqCompat option', function () {
    const connectionString = 'pg:///?sslmode=verify-ca'
    expect(function () {
      parse(connectionString, { useLibpqCompat: true })
    }).to.throw()
  })

  it('configuration parameter sslmode=verify-ca and sslrootcert with useLibpqCompat option', function () {
    const connectionString = 'pg:///?sslmode=verify-ca&sslrootcert=' + __dirname + '/example.ca'
    const subject = parse(connectionString, { useLibpqCompat: true })
    subject.ssl?.should.have.property('checkServerIdentity').that.is.a('function')
    // We prove above that the checkServerIdentity function is defined
    //
    // FIXME: remove this if we upgrade to TypeScript 5
    // @ts-ignore
    expect(subject.ssl?.checkServerIdentity()).be.undefined
  })

  it('configuration parameter sslmode=verify-full with useLibpqCompat option', function () {
    const connectionString = 'pg:///?sslmode=verify-full'
    const subject = parse(connectionString, { useLibpqCompat: true })
    subject.ssl?.should.eql({})
  })

  it('configuration parameter ssl=true and sslmode=require still work with sslrootcert=/path/to/ca with useLibpqCompat option', function () {
    const connectionString = 'pg:///?ssl=true&sslrootcert=' + __dirname + '/example.ca&sslmode=require'
    const subject = parse(connectionString, { useLibpqCompat: true })
    subject.ssl?.should.have.property('ca', 'example ca\n')
    subject.ssl?.should.have.property('checkServerIdentity').that.is.a('function')
    // We prove above that the checkServerIdentity function is defined
    //
    // FIXME: remove this if we upgrade to TypeScript 5
    // @ts-ignore
    expect(subject.ssl?.checkServerIdentity()).be.undefined
  })

  it('does not allow uselibpqcompat query parameter and useLibpqCompat option at the same time', function () {
    const connectionString = 'pg:///?uselibpqcompat=true'
    expect(function () {
      parse(connectionString, { useLibpqCompat: true })
    }).to.throw()
  })

  it('allow other params like max, ...', function () {
    const subject = parse('pg://myhost/db?max=18&min=4')
    subject.max?.should.equal('18')
    subject.min?.should.equal('4')
  })

  it('configuration parameter keepalives', function () {
    const connectionString = 'pg:///?keepalives=1'
    const subject = parse(connectionString)
    subject.keepalives?.should.equal('1')
  })

  it('unknown configuration parameter is passed into client', function () {
    const connectionString = 'pg:///?ThereIsNoSuchPostgresParameter=1234'
    const subject = parse(connectionString)
    subject.ThereIsNoSuchPostgresParameter?.should.equal('1234')
  })

  it('do not override a config field with value from query string', function () {
    const subject = parse('socket:/some path/?db=my[db]&encoding=utf8&client_encoding=bogus')
    subject.host?.should.equal('/some path/')
    subject.database?.should.equal('my[db]', 'must to be escaped and unescaped through "my%5Bdb%5D"')
    subject.client_encoding?.should.equal('utf8')
  })

  it('return last value of repeated parameter', function () {
    const connectionString = 'pg:///?keepalives=1&keepalives=0'
    const subject = parse(connectionString)
    subject.keepalives?.should.equal('0')
  })

  it('use the port specified in the query parameters', function () {
    const connectionString = 'postgres:///?host=localhost&port=1234'
    const subject = parse(connectionString)
    subject.port?.should.equal('1234')
  })
})
