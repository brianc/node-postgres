'use strict'
const helper = require('../test-helper')
const assert = require('assert')
const ConnectionParameters = require('../../../lib/connection-parameters')
const defaults = require('../../../lib').defaults
const dns = require('dns')

// clear process.env
for (const key in process.env) {
  delete process.env[key]
}

const suite = new helper.Suite()

suite.test('ConnectionParameters construction', function () {
  assert.ok(new ConnectionParameters(), 'with null config')
  assert.ok(new ConnectionParameters({ user: 'asdf' }), 'with config object')
  assert.ok(new ConnectionParameters('postgres://localhost/postgres'), 'with connection string')
})

const compare = function (actual, expected, type) {
  const expectedDatabase = expected.database === undefined ? expected.user : expected.database

  assert.equal(actual.user, expected.user, type + ' user')
  assert.equal(actual.database, expectedDatabase, type + ' database')
  assert.equal(actual.port, expected.port, type + ' port')
  assert.equal(actual.host, expected.host, type + ' host')
  assert.equal(actual.password, expected.password, type + ' password')
  assert.equal(actual.binary, expected.binary, type + ' binary')
  assert.equal(actual.statement_timeout, expected.statement_timeout, type + ' statement_timeout')
  assert.equal(actual.lock_timeout, expected.lock_timeout, type + ' lock_timeout')
  assert.equal(actual.options, expected.options, type + ' options')
  assert.equal(
    actual.idle_in_transaction_session_timeout,
    expected.idle_in_transaction_session_timeout,
    type + ' idle_in_transaction_session_timeout'
  )
}

suite.test('ConnectionParameters initializing from defaults', function () {
  const subject = new ConnectionParameters()
  compare(subject, defaults, 'defaults')
  assert.ok(subject.isDomainSocket === false)
})

suite.test('ConnectionParameters initializing from defaults with connectionString set', function () {
  const config = {
    user: 'brians-are-the-best',
    database: 'scoobysnacks',
    port: 7777,
    password: 'mypassword',
    host: 'foo.bar.net',
    binary: defaults.binary,
    statement_timeout: false,
    lock_timeout: false,
    idle_in_transaction_session_timeout: false,
    options: '-c geqo=off',
  }

  const original_value = defaults.connectionString
  // Just changing this here doesn't actually work because it's no longer in scope when viewed inside of
  // of ConnectionParameters() so we have to pass in the defaults explicitly to test it
  defaults.connectionString =
    'postgres://brians-are-the-best:mypassword@foo.bar.net:7777/scoobysnacks?options=-c geqo=off'
  const subject = new ConnectionParameters(defaults)
  defaults.connectionString = original_value
  compare(subject, config, 'defaults-connectionString')
})

suite.test('ConnectionParameters initializing from config', function () {
  const config = {
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
    lock_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
    options: '-c geqo=off',
  }
  const subject = new ConnectionParameters(config)
  compare(subject, config, 'config')
  assert.ok(subject.isDomainSocket === false)
})

suite.test('ConnectionParameters initializing from config and config.connectionString', function () {
  const subject1 = new ConnectionParameters({
    connectionString: 'postgres://test@host/db',
  })
  const subject2 = new ConnectionParameters({
    connectionString: 'postgres://test@host/db?ssl=1',
  })
  const subject3 = new ConnectionParameters({
    connectionString: 'postgres://test@host/db',
    ssl: true,
  })
  const subject4 = new ConnectionParameters({
    connectionString: 'postgres://test@host/db?ssl=1',
    ssl: false,
  })

  assert.equal(subject1.ssl, false)
  assert.equal(subject2.ssl, true)
  assert.equal(subject3.ssl, true)
  assert.equal(subject4.ssl, true)
})

suite.test('escape spaces if present', function () {
  const subject = new ConnectionParameters('postgres://localhost/post gres')
  assert.equal(subject.database, 'post gres')
})

suite.test('do not double escape spaces', function () {
  const subject = new ConnectionParameters('postgres://localhost/post%20gres')
  assert.equal(subject.database, 'post gres')
})

suite.test('initializing with unix domain socket', function () {
  const subject = new ConnectionParameters('/var/run/')
  assert.ok(subject.isDomainSocket)
  assert.equal(subject.host, '/var/run/')
  assert.equal(subject.database, defaults.user)
})

suite.test('initializing with unix domain socket and a specific database, the simple way', function () {
  const subject = new ConnectionParameters('/var/run/ mydb')
  assert.ok(subject.isDomainSocket)
  assert.equal(subject.host, '/var/run/')
  assert.equal(subject.database, 'mydb')
})

suite.test('initializing with unix domain socket, the health way', function () {
  const subject = new ConnectionParameters('socket:/some path/?db=my[db]&encoding=utf8')
  assert.ok(subject.isDomainSocket)
  assert.equal(subject.host, '/some path/')
  assert.equal(subject.database, 'my[db]', 'must to be escaped and unescaped trough "my%5Bdb%5D"')
  assert.equal(subject.client_encoding, 'utf8')
})

suite.test('initializing with unix domain socket, the escaped health way', function () {
  const subject = new ConnectionParameters('socket:/some%20path/?db=my%2Bdb&encoding=utf8')
  assert.ok(subject.isDomainSocket)
  assert.equal(subject.host, '/some path/')
  assert.equal(subject.database, 'my+db')
  assert.equal(subject.client_encoding, 'utf8')
})

const checkForPart = function (array, part) {
  assert.ok(array.indexOf(part) > -1, array.join(' ') + ' did not contain ' + part)
}

const getDNSHost = async function (host) {
  return new Promise((resolve, reject) => {
    dns.lookup(host, (err, addresses) => {
      err ? reject(err) : resolve(addresses)
    })
  })
}

suite.test('builds simple string', async function () {
  const config = {
    user: 'brian',
    password: 'xyz',
    host: 'localhost',
    port: 888,
    database: 'bam',
  }
  const subject = new ConnectionParameters(config)
  const dnsHost = await getDNSHost(config.host)
  return new Promise((resolve) => {
    subject.getLibpqConnectionString(function (err, constring) {
      assert(!err)
      const parts = constring.split(' ')
      checkForPart(parts, "user='brian'")
      checkForPart(parts, "password='xyz'")
      checkForPart(parts, `hostaddr='${dnsHost}'`)
      checkForPart(parts, "port='888'")
      checkForPart(parts, "dbname='bam'")
      resolve()
    })
  })
})

suite.test('builds dns string', async function () {
  const config = {
    user: 'brian',
    password: 'asdf',
    host: 'localhost',
    port: 5432,
  }
  const subject = new ConnectionParameters(config)
  const dnsHost = await getDNSHost(config.host)
  return new Promise((resolve) => {
    subject.getLibpqConnectionString(function (err, constring) {
      assert(!err)
      const parts = constring.split(' ')
      checkForPart(parts, "user='brian'")
      checkForPart(parts, `hostaddr='${dnsHost}'`)
      resolve()
    })
  })
})

suite.test('error when dns fails', function () {
  const config = {
    user: 'brian',
    password: 'asf',
    host: 'asdlfkjasldfkksfd#!$!!!!..com',
    port: 5432,
  }
  const subject = new ConnectionParameters(config)
  subject.getLibpqConnectionString(
    assert.calls(function (err, constring) {
      assert.ok(err)
      assert.isNull(constring)
    })
  )
})

suite.test('connecting to unix domain socket', function () {
  const config = {
    user: 'brian',
    password: 'asf',
    host: '/tmp/',
    port: 5432,
  }
  const subject = new ConnectionParameters(config)
  subject.getLibpqConnectionString(
    assert.calls(function (err, constring) {
      assert(!err)
      const parts = constring.split(' ')
      checkForPart(parts, "user='brian'")
      checkForPart(parts, "host='/tmp/'")
    })
  )
})

suite.test('config contains quotes and backslashes', function () {
  const config = {
    user: 'not\\brian',
    password: "bad'chars",
    host: '/tmp/',
    port: 5432,
  }
  const subject = new ConnectionParameters(config)
  subject.getLibpqConnectionString(
    assert.calls(function (err, constring) {
      assert(!err)
      const parts = constring.split(' ')
      checkForPart(parts, "user='not\\\\brian'")
      checkForPart(parts, "password='bad\\'chars'")
    })
  )
})

suite.test('encoding can be specified by config', function () {
  const config = {
    client_encoding: 'utf-8',
  }
  const subject = new ConnectionParameters(config)
  subject.getLibpqConnectionString(
    assert.calls(function (err, constring) {
      assert(!err)
      const parts = constring.split(' ')
      checkForPart(parts, "client_encoding='utf-8'")
    })
  )
})

suite.test('password contains  < and/or >  characters', function () {
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
  const subject = new ConnectionParameters(connectionString)
  assert.equal(subject.password, sourceConfig.password)
})

suite.test('username or password contains weird characters', function () {
  const defaults = require('../../../lib/defaults')
  defaults.ssl = true
  const strang = 'pg://my f%irst name:is&%awesome!@localhost:9000'
  const subject = new ConnectionParameters(strang)
  assert.equal(subject.user, 'my f%irst name')
  assert.equal(subject.password, 'is&%awesome!')
  assert.equal(subject.host, 'localhost')
  assert.equal(subject.ssl, true)
})

suite.test('url is properly encoded', function () {
  const encoded = 'pg://bi%25na%25%25ry%20:s%40f%23@localhost/%20u%2520rl'
  const subject = new ConnectionParameters(encoded)
  assert.equal(subject.user, 'bi%na%%ry ')
  assert.equal(subject.password, 's@f#')
  assert.equal(subject.host, 'localhost')
  assert.equal(subject.database, ' u%20rl')
})

suite.test('ssl is set on client', function () {
  const Client = require('../../../lib/client')
  const defaults = require('../../../lib/defaults')
  defaults.ssl = true
  const c = new Client('postgres://user:password@host/database')
  assert(c.ssl, 'Client should have ssl enabled via defaults')
})

suite.test('coercing string "true" to boolean', function () {
  const subject = new ConnectionParameters({ ssl: 'true' })
  assert.strictEqual(subject.ssl, true)
})

suite.test('ssl is set on client', function () {
  const sourceConfig = {
    user: 'brian',
    password: 'hello<ther>e',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    ssl: {
      sslmode: 'verify-ca',
      sslca: '/path/ca.pem',
      sslkey: '/path/cert.key',
      sslcert: '/path/cert.crt',
      sslrootcert: '/path/root.crt',
    },
  }
  const defaults = require('../../../lib/defaults')
  defaults.ssl = true
  const c = new ConnectionParameters(sourceConfig)
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

suite.test('sslnegotiation defaults to undefined', function () {
  const subject = new ConnectionParameters({})
  assert.strictEqual(subject.sslnegotiation, undefined)
})

suite.test('sslnegotiation=direct is read from config', function () {
  const subject = new ConnectionParameters({ ssl: true, sslnegotiation: 'direct' })
  assert.strictEqual(subject.sslnegotiation, 'direct')
})

suite.test('sslnegotiation=postgres is read from config', function () {
  const subject = new ConnectionParameters({ ssl: true, sslnegotiation: 'postgres' })
  assert.strictEqual(subject.sslnegotiation, 'postgres')
})

suite.test('sslnegotiation rejects invalid values', function () {
  assert.throws(() => new ConnectionParameters({ ssl: true, sslnegotiation: 'bogus' }), /Invalid sslnegotiation value/)
})

suite.test('sslnegotiation=direct requires ssl', function () {
  assert.throws(() => new ConnectionParameters({ ssl: false, sslnegotiation: 'direct' }), /requires SSL to be enabled/)
})

suite.test('sslnegotiation is read from PGSSLNEGOTIATION env var', function () {
  const original = process.env.PGSSLNEGOTIATION
  process.env.PGSSLNEGOTIATION = 'direct'
  try {
    const subject = new ConnectionParameters({ ssl: true })
    assert.strictEqual(subject.sslnegotiation, 'direct')
  } finally {
    if (original === undefined) {
      delete process.env.PGSSLNEGOTIATION
    } else {
      process.env.PGSSLNEGOTIATION = original
    }
  }
})

suite.test('channel_binding defaults to prefer', function () {
  const subject = new ConnectionParameters({})
  assert.strictEqual(subject.channel_binding, 'prefer')
})

suite.test('channel_binding is read from config', function () {
  for (const channel_binding of ['disable', 'prefer', 'require']) {
    const subject = new ConnectionParameters({ ssl: true, channel_binding })
    assert.strictEqual(subject.channel_binding, channel_binding)
  }
})

suite.test('channel_binding is read from a connection string', function () {
  const subject = new ConnectionParameters({ connectionString: 'postgres://host/db?channel_binding=disable' })
  assert.strictEqual(subject.channel_binding, 'disable')
})

suite.test('channel_binding rejects invalid values', function () {
  assert.throws(() => new ConnectionParameters({ channel_binding: 'bogus' }), /Invalid channel_binding value/)
  assert.throws(
    () => new ConnectionParameters({ connectionString: 'postgres://host/db?channel_binding=bogus' }),
    /Invalid channel_binding value/
  )
})

suite.test('channel_binding=require requires ssl', function () {
  assert.throws(
    () => new ConnectionParameters({ ssl: false, channel_binding: 'require' }),
    /channel_binding=require requires SSL to be enabled/
  )
})

suite.test('the boolean enableChannelBinding option maps onto the channel binding levels', function () {
  assert.strictEqual(new ConnectionParameters({ enableChannelBinding: true }).channel_binding, 'prefer')
  assert.strictEqual(new ConnectionParameters({ enableChannelBinding: false }).channel_binding, 'disable')
})

suite.test('enableChannelBinding also accepts the channel binding levels', function () {
  const subject = new ConnectionParameters({ ssl: true, enableChannelBinding: 'require' })
  assert.strictEqual(subject.channel_binding, 'require')
})

suite.test('channel_binding takes precedence over enableChannelBinding', function () {
  const subject = new ConnectionParameters({ channel_binding: 'disable', enableChannelBinding: true })
  assert.strictEqual(subject.channel_binding, 'disable')
})

suite.test('enableChannelBinding is ignored in a connection string', function () {
  // Only libpq's channel_binding parameter is recognized there, so the default stands.
  const subject = new ConnectionParameters({ connectionString: 'postgres://host/db?enableChannelBinding=disable' })
  assert.strictEqual(subject.channel_binding, 'prefer')
})

suite.test('a camelCased channelBinding or requireAuth is rejected rather than ignored', function () {
  assert.throws(
    () => new ConnectionParameters({ channelBinding: 'require' }),
    /The channelBinding option is not recognized: spell it channel_binding/
  )
  assert.throws(
    () => new ConnectionParameters({ requireAuth: 'scram-sha-256' }),
    /The requireAuth option is not recognized: spell it require_auth/
  )

  // the parser passes query parameters it does not recognize through as they are written,
  // so a connection string is held to the same spelling
  assert.throws(
    () => new ConnectionParameters({ connectionString: 'postgres://host/db?channelBinding=require' }),
    /The channelBinding option is not recognized/
  )

  // the libpq spellings, and the legacy enableChannelBinding option, are what work
  const subject = new ConnectionParameters({
    channel_binding: 'disable',
    require_auth: 'md5',
    enableChannelBinding: true,
  })
  assert.strictEqual(subject.channel_binding, 'disable')
  assert.strictEqual(subject.require_auth, 'md5')
})

suite.test('channel_binding is read from PGCHANNELBINDING env var', function () {
  const original = process.env.PGCHANNELBINDING
  process.env.PGCHANNELBINDING = 'disable'
  try {
    const subject = new ConnectionParameters({})
    assert.strictEqual(subject.channel_binding, 'disable')
  } finally {
    if (original === undefined) {
      delete process.env.PGCHANNELBINDING
    } else {
      process.env.PGCHANNELBINDING = original
    }
  }
})

suite.test('channel_binding is included in libpq connection string when it is not the libpq default', function () {
  const subject = new ConnectionParameters({
    user: 'brian',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    ssl: true,
    channel_binding: 'require',
  })
  subject.getLibpqConnectionString(
    assert.calls(function (err, pgCString) {
      assert(!err)
      assert.equal(
        pgCString.indexOf("channel_binding='require'") !== -1,
        true,
        'libpqConnectionString should contain channel_binding'
      )
    })
  )
})

suite.test('channel_binding is omitted from libpq connection string when it is the libpq default', function () {
  const subject = new ConnectionParameters({
    user: 'brian',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
  })
  subject.getLibpqConnectionString(
    assert.calls(function (err, pgCString) {
      assert(!err)
      assert.equal(pgCString.indexOf('channel_binding'), -1, 'libpqConnectionString should not contain channel_binding')
    })
  )
})

suite.test('require_auth is unset by default, requiring nothing of the server', function () {
  const subject = new ConnectionParameters({})
  assert.strictEqual(subject.require_auth, undefined)
  assert.strictEqual(subject.authRequirement, null)
})

suite.test('require_auth is read from config', function () {
  const subject = new ConnectionParameters({ require_auth: 'md5' })
  assert.strictEqual(subject.require_auth, 'md5')
  assert.deepStrictEqual([...subject.authRequirement.allowedMethods], ['md5'])
})

suite.test('require_auth is read from a connection string', function () {
  const subject = new ConnectionParameters({ connectionString: 'postgres://host/db?require_auth=scram-sha-256' })
  assert.strictEqual(subject.require_auth, 'scram-sha-256')
  assert.deepStrictEqual([...subject.authRequirement.allowedMethods], ['scram-sha-256'])
})

suite.test('require_auth is read from PGREQUIREAUTH env var', function () {
  const original = process.env.PGREQUIREAUTH
  process.env.PGREQUIREAUTH = 'password'
  try {
    assert.strictEqual(new ConnectionParameters({}).require_auth, 'password')
    // config takes precedence over the environment
    assert.strictEqual(new ConnectionParameters({ require_auth: 'md5' }).require_auth, 'md5')

    // an explicitly empty config value requires nothing, and says so in preference to the
    // environment, rather than being treated as absent and falling through to it. It is
    // kept verbatim so that libpq hears it as well, which the conninfo test below covers.
    const explicitlyEmpty = new ConnectionParameters({ require_auth: '' })
    assert.strictEqual(explicitlyEmpty.require_auth, '')
    assert.strictEqual(explicitlyEmpty.authRequirement, null)

    // as in libpq, an empty setting requires nothing rather than permitting nothing
    process.env.PGREQUIREAUTH = ''
    const subject = new ConnectionParameters({})
    assert.strictEqual(subject.require_auth, undefined)
    assert.strictEqual(subject.authRequirement, null)
  } finally {
    if (original === undefined) {
      delete process.env.PGREQUIREAUTH
    } else {
      process.env.PGREQUIREAUTH = original
    }
  }
})

suite.test('require_auth rejects values it could never satisfy', function () {
  assert.throws(() => new ConnectionParameters({ require_auth: 'bogus' }), /Invalid require_auth value/)
  assert.throws(() => new ConnectionParameters({ require_auth: 'gss' }), /cannot be satisfied/)
  assert.throws(
    () => new ConnectionParameters({ connectionString: 'postgres://host/db?require_auth=md5,!password' }),
    /cannot be mixed/
  )
})

suite.test('channel_binding=require narrows the requirement to bound SCRAM', function () {
  const subject = new ConnectionParameters({ ssl: true, channel_binding: 'require', require_auth: 'md5,scram-sha-256' })
  assert.deepStrictEqual([...subject.authRequirement.allowedMethods], ['scram-sha-256'])
  assert.strictEqual(subject.authRequirement.channelBindingRequired, true)
  // the setting itself is passed through unchanged, for libpq to enforce in its own way
  assert.strictEqual(subject.require_auth, 'md5,scram-sha-256')
})

suite.test('channel_binding=require conflicts with a require_auth that rules out SCRAM', function () {
  assert.throws(
    () => new ConnectionParameters({ ssl: true, channel_binding: 'require', require_auth: 'md5' }),
    /channel_binding=require cannot be satisfied by require_auth="md5"/
  )
})

// Parameters bound for libpq are libpq's to judge: it authenticates by methods this
// library does not implement, and it negotiates SSL whether or not one was configured
// here, so a configuration it can honor must not be refused on this side.
suite.test('parameters for libpq permit the methods libpq performs', function () {
  const subject = new ConnectionParameters({ require_auth: 'gss' }, { native: true })
  assert.deepStrictEqual([...subject.authRequirement.allowedMethods], ['gss'])
  assert.strictEqual(subject.require_auth, 'gss')

  // the same configuration cannot work with this library's own protocol implementation
  assert.throws(() => new ConnectionParameters({ require_auth: 'gss' }), /cannot be satisfied/)
})

suite.test('parameters for libpq leave SSL negotiation to libpq', function () {
  // ssl is stated either way, since earlier tests in this file leave defaults.ssl set.
  // A falsy one is not passed on to libpq as an sslmode at all, so libpq goes on to
  // negotiate SSL by its own default and can bind the channel after all.
  const subject = new ConnectionParameters({ ssl: false, channel_binding: 'require' }, { native: true })
  assert.strictEqual(subject.channel_binding, 'require')

  assert.throws(
    () => new ConnectionParameters({ ssl: false, channel_binding: 'require' }),
    /requires SSL to be enabled/
  )
})

suite.test('parameters for libpq are still checked for what libpq would reject', function () {
  assert.throws(() => new ConnectionParameters({ require_auth: 'bogus' }, { native: true }), /Invalid require_auth/)
  assert.throws(() => new ConnectionParameters({ require_auth: 'md5,!gss' }, { native: true }), /cannot be mixed/)
  assert.throws(
    () => new ConnectionParameters({ channel_binding: 'require', require_auth: 'gss' }, { native: true }),
    /channel_binding=require cannot be satisfied by require_auth="gss"/
  )
  assert.throws(
    () => new ConnectionParameters({ channel_binding: 'bogus' }, { native: true }),
    /Invalid channel_binding/
  )
})

suite.test('an explicitly empty require_auth reaches libpq, overriding the environment there too', function () {
  const original = process.env.PGREQUIREAUTH
  process.env.PGREQUIREAUTH = 'scram-sha-256'

  try {
    const subject = new ConnectionParameters(
      { user: 'brian', host: 'localhost', port: 5432, database: 'postgres', require_auth: '' },
      { native: true }
    )
    assert.strictEqual(subject.require_auth, '')
    assert.strictEqual(subject.authRequirement, null)

    subject.getLibpqConnectionString(
      assert.calls(function (err, pgCString) {
        assert(!err)
        // Saying nothing would leave libpq to read PGREQUIREAUTH for itself, undoing the
        // override; an empty value is how conninfo says that nothing is required.
        assert.notStrictEqual(pgCString.indexOf("require_auth=''"), -1, pgCString)
      })
    )
  } finally {
    if (original === undefined) {
      delete process.env.PGREQUIREAUTH
    } else {
      process.env.PGREQUIREAUTH = original
    }
  }
})

suite.test('require_auth is included in libpq connection string only when set', function () {
  new ConnectionParameters({
    user: 'brian',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
  }).getLibpqConnectionString(
    assert.calls(function (err, pgCString) {
      assert(!err)
      assert.equal(pgCString.indexOf('require_auth'), -1, 'libpqConnectionString should not contain require_auth')
    })
  )

  new ConnectionParameters({
    user: 'brian',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    require_auth: 'scram-sha-256',
  }).getLibpqConnectionString(
    assert.calls(function (err, pgCString) {
      assert(!err)
      assert.notStrictEqual(pgCString.indexOf("require_auth='scram-sha-256'"), -1)
    })
  )
})

suite.test('sslnegotiation is included in libpq connection string', function () {
  const subject = new ConnectionParameters({
    user: 'brian',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    ssl: true,
    sslnegotiation: 'direct',
  })
  subject.getLibpqConnectionString(
    assert.calls(function (err, pgCString) {
      assert(!err)
      assert.equal(
        pgCString.indexOf("sslnegotiation='direct'") !== -1,
        true,
        'libpqConnectionString should contain sslnegotiation'
      )
    })
  )
})
