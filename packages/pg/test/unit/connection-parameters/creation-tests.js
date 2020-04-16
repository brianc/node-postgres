'use strict'
var helper = require(__dirname + '/../test-helper')
var assert = require('assert')
var ConnectionParameters = require(__dirname + '/../../../lib/connection-parameters')
var defaults = require(__dirname + '/../../../lib').defaults

// clear process.env
for (var key in process.env) {
  delete process.env[key]
}

test('ConnectionParameters construction', function () {
  assert.ok(new ConnectionParameters(), 'with null config')
  assert.ok(new ConnectionParameters({ user: 'asdf' }), 'with config object')
  assert.ok(new ConnectionParameters('postgres://localhost/postgres'), 'with connection string')
})

var compare = function (actual, expected, type) {
  const expectedDatabase = expected.database === undefined ? expected.user : expected.database

  assert.equal(actual.user, expected.user, type + ' user')
  assert.equal(actual.database, expectedDatabase, type + ' database')
  assert.equal(actual.port, expected.port, type + ' port')
  assert.equal(actual.host, expected.host, type + ' host')
  assert.equal(actual.password, expected.password, type + ' password')
  assert.equal(actual.binary, expected.binary, type + ' binary')
  assert.equal(actual.statement_timeout, expected.statement_timeout, type + ' statement_timeout')
  assert.equal(
    actual.idle_in_transaction_session_timeout,
    expected.idle_in_transaction_session_timeout,
    type + ' idle_in_transaction_session_timeout'
  )
}

test('ConnectionParameters initializing from defaults', function () {
  var subject = new ConnectionParameters()
  compare(subject, defaults, 'defaults')
  assert.ok(subject.isDomainSocket === false)
})

test('ConnectionParameters initializing from defaults with connectionString set', function () {
  var config = {
    user: 'brians-are-the-best',
    database: 'scoobysnacks',
    port: 7777,
    password: 'mypassword',
    host: 'foo.bar.net',
    binary: defaults.binary,
    statement_timeout: false,
    idle_in_transaction_session_timeout: false,
  }

  var original_value = defaults.connectionString
  // Just changing this here doesn't actually work because it's no longer in scope when viewed inside of
  // of ConnectionParameters() so we have to pass in the defaults explicitly to test it
  defaults.connectionString = 'postgres://brians-are-the-best:mypassword@foo.bar.net:7777/scoobysnacks'
  var subject = new ConnectionParameters(defaults)
  defaults.connectionString = original_value
  compare(subject, config, 'defaults-connectionString')
})

test('ConnectionParameters initializing from config', function () {
  var config = {
    user: 'brian',
    database: 'home',
    port: 7777,
    password: 'pizza',
    binary: true,
    encoding: 'utf8',
    host: 'yo',
    ssl: {
      asdf: 'blah',
    },
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
  }
  var subject = new ConnectionParameters(config)
  compare(subject, config, 'config')
  assert.ok(subject.isDomainSocket === false)
})

test('ConnectionParameters initializing from config and config.connectionString', function () {
  var subject1 = new ConnectionParameters({
    connectionString: 'postgres://test@host/db',
  })
  var subject2 = new ConnectionParameters({
    connectionString: 'postgres://test@host/db?ssl=1',
  })
  var subject3 = new ConnectionParameters({
    connectionString: 'postgres://test@host/db',
    ssl: true,
  })
  var subject4 = new ConnectionParameters({
    connectionString: 'postgres://test@host/db?ssl=1',
    ssl: false,
  })

  assert.equal(subject1.ssl, false)
  assert.equal(subject2.ssl, true)
  assert.equal(subject3.ssl, true)
  assert.equal(subject4.ssl, true)
})

test('escape spaces if present', function () {
  var subject = new ConnectionParameters('postgres://localhost/post gres')
  assert.equal(subject.database, 'post gres')
})

test('do not double escape spaces', function () {
  var subject = new ConnectionParameters('postgres://localhost/post%20gres')
  assert.equal(subject.database, 'post gres')
})

test('initializing with unix domain socket', function () {
  var subject = new ConnectionParameters('/var/run/')
  assert.ok(subject.isDomainSocket)
  assert.equal(subject.host, '/var/run/')
  assert.equal(subject.database, defaults.user)
})

test('initializing with unix domain socket and a specific database, the simple way', function () {
  var subject = new ConnectionParameters('/var/run/ mydb')
  assert.ok(subject.isDomainSocket)
  assert.equal(subject.host, '/var/run/')
  assert.equal(subject.database, 'mydb')
})

test('initializing with unix domain socket, the health way', function () {
  var subject = new ConnectionParameters('socket:/some path/?db=my[db]&encoding=utf8')
  assert.ok(subject.isDomainSocket)
  assert.equal(subject.host, '/some path/')
  assert.equal(subject.database, 'my[db]', 'must to be escaped and unescaped trough "my%5Bdb%5D"')
  assert.equal(subject.client_encoding, 'utf8')
})

test('initializing with unix domain socket, the escaped health way', function () {
  var subject = new ConnectionParameters('socket:/some%20path/?db=my%2Bdb&encoding=utf8')
  assert.ok(subject.isDomainSocket)
  assert.equal(subject.host, '/some path/')
  assert.equal(subject.database, 'my+db')
  assert.equal(subject.client_encoding, 'utf8')
})

test('libpq connection string building', function () {
  var checkForPart = function (array, part) {
    assert.ok(array.indexOf(part) > -1, array.join(' ') + ' did not contain ' + part)
  }

  test('builds simple string', function () {
    var config = {
      user: 'brian',
      password: 'xyz',
      port: 888,
      host: 'localhost',
      database: 'bam',
    }
    var subject = new ConnectionParameters(config)
    subject.getLibpqConnectionString(
      assert.calls(function (err, constring) {
        assert(!err)
        var parts = constring.split(' ')
        checkForPart(parts, "user='brian'")
        checkForPart(parts, "password='xyz'")
        checkForPart(parts, "port='888'")
        checkForPart(parts, "hostaddr='127.0.0.1'")
        checkForPart(parts, "dbname='bam'")
      })
    )
  })

  test('builds dns string', function () {
    var config = {
      user: 'brian',
      password: 'asdf',
      port: 5432,
      host: 'localhost',
    }
    var subject = new ConnectionParameters(config)
    subject.getLibpqConnectionString(
      assert.calls(function (err, constring) {
        assert(!err)
        var parts = constring.split(' ')
        checkForPart(parts, "user='brian'")
        checkForPart(parts, "hostaddr='127.0.0.1'")
      })
    )
  })

  test('error when dns fails', function () {
    var config = {
      user: 'brian',
      password: 'asf',
      port: 5432,
      host: 'asdlfkjasldfkksfd#!$!!!!..com',
    }
    var subject = new ConnectionParameters(config)
    subject.getLibpqConnectionString(
      assert.calls(function (err, constring) {
        assert.ok(err)
        assert.isNull(constring)
      })
    )
  })

  test('connecting to unix domain socket', function () {
    var config = {
      user: 'brian',
      password: 'asf',
      port: 5432,
      host: '/tmp/',
    }
    var subject = new ConnectionParameters(config)
    subject.getLibpqConnectionString(
      assert.calls(function (err, constring) {
        assert(!err)
        var parts = constring.split(' ')
        checkForPart(parts, "user='brian'")
        checkForPart(parts, "host='/tmp/'")
      })
    )
  })

  test('config contains quotes and backslashes', function () {
    var config = {
      user: 'not\\brian',
      password: "bad'chars",
      port: 5432,
      host: '/tmp/',
    }
    var subject = new ConnectionParameters(config)
    subject.getLibpqConnectionString(
      assert.calls(function (err, constring) {
        assert(!err)
        var parts = constring.split(' ')
        checkForPart(parts, "user='not\\\\brian'")
        checkForPart(parts, "password='bad\\'chars'")
      })
    )
  })

  test('encoding can be specified by config', function () {
    var config = {
      client_encoding: 'utf-8',
    }
    var subject = new ConnectionParameters(config)
    subject.getLibpqConnectionString(
      assert.calls(function (err, constring) {
        assert(!err)
        var parts = constring.split(' ')
        checkForPart(parts, "client_encoding='utf-8'")
      })
    )
  })

  test('password contains  < and/or >  characters', function () {
    return false
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
    var subject = new ConnectionParameters(connectionString)
    assert.equal(subject.password, sourceConfig.password)
  })

  test('username or password contains weird characters', function () {
    var defaults = require('../../../lib/defaults')
    defaults.ssl = true
    var strang = 'pg://my f%irst name:is&%awesome!@localhost:9000'
    var subject = new ConnectionParameters(strang)
    assert.equal(subject.user, 'my f%irst name')
    assert.equal(subject.password, 'is&%awesome!')
    assert.equal(subject.host, 'localhost')
    assert.equal(subject.ssl, true)
  })

  test('url is properly encoded', function () {
    var encoded = 'pg://bi%25na%25%25ry%20:s%40f%23@localhost/%20u%2520rl'
    var subject = new ConnectionParameters(encoded)
    assert.equal(subject.user, 'bi%na%%ry ')
    assert.equal(subject.password, 's@f#')
    assert.equal(subject.host, 'localhost')
    assert.equal(subject.database, ' u%20rl')
  })

  test('ssl is set on client', function () {
    var Client = require('../../../lib/client')
    var defaults = require('../../../lib/defaults')
    defaults.ssl = true
    var c = new Client('postgres://user@password:host/database')
    assert(c.ssl, 'Client should have ssl enabled via defaults')
  })

  test('ssl is set on client', function () {
    var sourceConfig = {
      user: 'brian',
      password: 'hello<ther>e',
      port: 5432,
      host: 'localhost',
      database: 'postgres',
      ssl: {
        sslmode: 'verify-ca',
        sslca: '/path/ca.pem',
        sslkey: '/path/cert.key',
        sslcert: '/path/cert.crt',
        sslrootcert: '/path/root.crt',
      },
    }
    var Client = require('../../../lib/client')
    var defaults = require('../../../lib/defaults')
    defaults.ssl = true
    var c = new ConnectionParameters(sourceConfig)
    c.getLibpqConnectionString(
      assert.calls(function (err, pgCString) {
        assert(!err)
        assert.equal(
          pgCString.indexOf("sslrootcert='/path/root.crt'") !== -1,
          true,
          'libpqConnectionString should contain sslrootcert'
        )
      })
    )
  })
})
