'use strict'

var chai = require('chai')
var expect = chai.expect
chai.should()

var parse = require('../').parse

describe('parse', function () {
  it('using connection string in client constructor', function () {
    var subject = parse('postgres://brian:pw@boom:381/lala')
    subject.user.should.equal('brian')
    subject.password.should.equal('pw')
    subject.host.should.equal('boom')
    subject.port.should.equal('381')
    subject.database.should.equal('lala')
  })

  it('escape spaces if present', function () {
    var subject = parse('postgres://localhost/post gres')
    subject.database.should.equal('post gres')
  })

  it('do not double escape spaces', function () {
    var subject = parse('postgres://localhost/post%20gres')
    subject.database.should.equal('post gres')
  })

  it('initializing with unix domain socket', function () {
    var subject = parse('/var/run/')
    subject.host.should.equal('/var/run/')
  })

  it('initializing with unix domain socket and a specific database, the simple way', function () {
    var subject = parse('/var/run/ mydb')
    subject.host.should.equal('/var/run/')
    subject.database.should.equal('mydb')
  })

  it('initializing with unix domain socket, the health way', function () {
    var subject = parse('socket:/some path/?db=my[db]&encoding=utf8')
    subject.host.should.equal('/some path/')
    subject.database.should.equal('my[db]', 'must to be escaped and unescaped trough "my%5Bdb%5D"')
    subject.client_encoding.should.equal('utf8')
  })

  it('initializing with unix domain socket, the escaped health way', function () {
    var subject = parse('socket:/some%20path/?db=my%2Bdb&encoding=utf8')
    subject.host.should.equal('/some path/')
    subject.database.should.equal('my+db')
    subject.client_encoding.should.equal('utf8')
  })

  it('initializing with unix domain socket, username and password', function () {
    var subject = parse('socket://brian:pw@/var/run/?db=mydb')
    subject.user.should.equal('brian')
    subject.password.should.equal('pw')
    subject.host.should.equal('/var/run/')
    subject.database.should.equal('mydb')
  })

  it('password contains  < and/or >  characters', function () {
    var sourceConfig = {
      user: 'brian',
      password: 'hello<ther>e',
      port: 5432,
      host: 'localhost',
      database: 'postgres',
    }
    var connectionString =
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
    var subject = parse(connectionString)
    subject.password.should.equal(sourceConfig.password)
  })

  it('password contains colons', function () {
    var sourceConfig = {
      user: 'brian',
      password: 'hello:pass:world',
      port: 5432,
      host: 'localhost',
      database: 'postgres',
    }
    var connectionString =
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
    var subject = parse(connectionString)
    subject.password.should.equal(sourceConfig.password)
  })

  it('username or password contains weird characters', function () {
    var strang = 'pg://my f%irst name:is&%awesome!@localhost:9000'
    var subject = parse(strang)
    subject.user.should.equal('my f%irst name')
    subject.password.should.equal('is&%awesome!')
    subject.host.should.equal('localhost')
  })

  it('url is properly encoded', function () {
    var encoded = 'pg://bi%25na%25%25ry%20:s%40f%23@localhost/%20u%2520rl'
    var subject = parse(encoded)
    subject.user.should.equal('bi%na%%ry ')
    subject.password.should.equal('s@f#')
    subject.host.should.equal('localhost')
    subject.database.should.equal(' u%20rl')
  })

  it('relative url sets database', function () {
    var relative = 'different_db_on_default_host'
    var subject = parse(relative)
    subject.database.should.equal('different_db_on_default_host')
  })

  it('no pathname returns null database', function () {
    var subject = parse('pg://myhost')
    ;(subject.database === null).should.equal(true)
  })

  it('pathname of "/" returns null database', function () {
    var subject = parse('pg://myhost/')
    subject.host.should.equal('myhost')
    ;(subject.database === null).should.equal(true)
  })

  it('configuration parameter host', function () {
    var subject = parse('pg://user:pass@/dbname?host=/unix/socket')
    subject.user.should.equal('user')
    subject.password.should.equal('pass')
    subject.host.should.equal('/unix/socket')
    subject.database.should.equal('dbname')
  })

  it('configuration parameter host overrides url host', function () {
    var subject = parse('pg://user:pass@localhost/dbname?host=/unix/socket')
    subject.host.should.equal('/unix/socket')
  })

  it('url with encoded socket', function () {
    var subject = parse('pg://user:pass@%2Funix%2Fsocket/dbname')
    subject.user.should.equal('user')
    subject.password.should.equal('pass')
    subject.host.should.equal('/unix/socket')
    subject.database.should.equal('dbname')
  })

  it('url with real host and an encoded db name', function () {
    var subject = parse('pg://user:pass@localhost/%2Fdbname')
    subject.user.should.equal('user')
    subject.password.should.equal('pass')
    subject.host.should.equal('localhost')
    subject.database.should.equal('%2Fdbname')
  })

  it('configuration parameter host treats encoded socket as part of the db name', function () {
    var subject = parse('pg://user:pass@%2Funix%2Fsocket/dbname?host=localhost')
    subject.user.should.equal('user')
    subject.password.should.equal('pass')
    subject.host.should.equal('localhost')
    subject.database.should.equal('%2Funix%2Fsocket/dbname')
  })

  it('configuration parameter application_name', function () {
    var connectionString = 'pg:///?application_name=TheApp'
    var subject = parse(connectionString)
    subject.application_name.should.equal('TheApp')
  })

  it('configuration parameter fallback_application_name', function () {
    var connectionString = 'pg:///?fallback_application_name=TheAppFallback'
    var subject = parse(connectionString)
    subject.fallback_application_name.should.equal('TheAppFallback')
  })

  it('configuration parameter options', function () {
    var connectionString = 'pg:///?options=-c geqo=off'
    var subject = parse(connectionString)
    subject.options.should.equal('-c geqo=off')
  })

  it('configuration parameter ssl=true', function () {
    var connectionString = 'pg:///?ssl=true'
    var subject = parse(connectionString)
    subject.ssl.should.equal(true)
  })

  it('configuration parameter ssl=1', function () {
    var connectionString = 'pg:///?ssl=1'
    var subject = parse(connectionString)
    subject.ssl.should.equal(true)
  })

  it('configuration parameter ssl=0', function () {
    var connectionString = 'pg:///?ssl=0'
    var subject = parse(connectionString)
    subject.ssl.should.equal(false)
  })

  it('set ssl', function () {
    var subject = parse('pg://myhost/db?ssl=1')
    subject.ssl.should.equal(true)
  })

  it('configuration parameter sslcert=/path/to/cert', function () {
    var connectionString = 'pg:///?sslcert=' + __dirname + '/example.cert'
    var subject = parse(connectionString)
    subject.ssl.should.eql({
      cert: 'example cert\n',
    })
  })

  it('configuration parameter sslkey=/path/to/key', function () {
    var connectionString = 'pg:///?sslkey=' + __dirname + '/example.key'
    var subject = parse(connectionString)
    subject.ssl.should.eql({
      key: 'example key\n',
    })
  })

  it('configuration parameter sslrootcert=/path/to/ca', function () {
    var connectionString = 'pg:///?sslrootcert=' + __dirname + '/example.ca'
    var subject = parse(connectionString)
    subject.ssl.should.eql({
      ca: 'example ca\n',
    })
  })

  it('configuration parameter sslmode=no-verify', function () {
    var connectionString = 'pg:///?sslmode=no-verify'
    var subject = parse(connectionString)
    subject.ssl.should.eql({
      rejectUnauthorized: false,
    })
  })

  it('configuration parameter sslmode=disable', function () {
    var connectionString = 'pg:///?sslmode=disable'
    var subject = parse(connectionString)
    subject.ssl.should.eql(false)
  })

  it('configuration parameter sslmode=prefer', function () {
    var connectionString = 'pg:///?sslmode=prefer'
    var subject = parse(connectionString)
    subject.ssl.should.eql({})
  })

  it('configuration parameter sslmode=require', function () {
    var connectionString = 'pg:///?sslmode=require'
    var subject = parse(connectionString)
    subject.ssl.should.eql({})
  })

  it('configuration parameter sslmode=verify-ca', function () {
    var connectionString = 'pg:///?sslmode=verify-ca'
    var subject = parse(connectionString)
    subject.ssl.should.eql({})
  })

  it('configuration parameter sslmode=verify-full', function () {
    var connectionString = 'pg:///?sslmode=verify-full'
    var subject = parse(connectionString)
    subject.ssl.should.eql({})
  })

  it('configuration parameter ssl=true and sslmode=require still work with sslrootcert=/path/to/ca', function () {
    var connectionString = 'pg:///?ssl=true&sslrootcert=' + __dirname + '/example.ca&sslmode=require'
    var subject = parse(connectionString)
    subject.ssl.should.eql({
      ca: 'example ca\n',
    })
  })

  it('allow other params like max, ...', function () {
    var subject = parse('pg://myhost/db?max=18&min=4')
    subject.max.should.equal('18')
    subject.min.should.equal('4')
  })

  it('configuration parameter keepalives', function () {
    var connectionString = 'pg:///?keepalives=1'
    var subject = parse(connectionString)
    subject.keepalives.should.equal('1')
  })

  it('unknown configuration parameter is passed into client', function () {
    var connectionString = 'pg:///?ThereIsNoSuchPostgresParameter=1234'
    var subject = parse(connectionString)
    subject.ThereIsNoSuchPostgresParameter.should.equal('1234')
  })

  it('do not override a config field with value from query string', function () {
    var subject = parse('socket:/some path/?db=my[db]&encoding=utf8&client_encoding=bogus')
    subject.host.should.equal('/some path/')
    subject.database.should.equal('my[db]', 'must to be escaped and unescaped through "my%5Bdb%5D"')
    subject.client_encoding.should.equal('utf8')
  })

  it('return last value of repeated parameter', function () {
    var connectionString = 'pg:///?keepalives=1&keepalives=0'
    var subject = parse(connectionString)
    subject.keepalives.should.equal('0')
  })
})
