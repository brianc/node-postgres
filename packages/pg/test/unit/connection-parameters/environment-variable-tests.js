'use strict'
var helper = require('../test-helper')
const Suite = require('../../suite')

var assert = require('assert')
const fs = require('fs')

const tmp = require('tmp')
tmp.setGracefulCleanup()

var ConnectionParameters = require('../../../lib/connection-parameters')
var defaults = require('../../../lib').defaults

// clear process.env
var realEnv = {}
for (var key in process.env) {
  realEnv[key] = process.env[key]
  delete process.env[key]
}

const suite = new Suite('ConnectionParameters')

const clearEnv = () => {
  // clear process.env
  for (var key in process.env) {
    delete process.env[key]
  }
}

suite.test('ConnectionParameters initialized from environment variables', function () {
  clearEnv()
  process.env['PGHOST'] = 'local'
  process.env['PGUSER'] = 'bmc2'
  process.env['PGPORT'] = 7890
  process.env['PGDATABASE'] = 'allyerbase'
  process.env['PGPASSWORD'] = 'open'

  var subject = new ConnectionParameters()
  assert.equal(subject.host, 'local', 'env host')
  assert.equal(subject.user, 'bmc2', 'env user')
  assert.equal(subject.port, 7890, 'env port')
  assert.equal(subject.database, 'allyerbase', 'env database')
  assert.equal(subject.password, 'open', 'env password')
  assert.equal(subject.ssl, false, 'ssl')
})

suite.test('ConnectionParameters initialized from environment variables - ssl', function () {
  createTempTlsFilesAndExecute(function(
    certFilePath, keyFilePath, caFilePath, 
    certFileContents, keyFileContents, caFileContents
  ) {
      clearEnv()
      process.env['PGHOST'] = 'local'
      process.env['PGUSER'] = 'bmc2'
      process.env['PGPORT'] = 7890
      process.env['PGDATABASE'] = 'allyerbase'
      process.env['PGPASSWORD'] = 'open'
    
      process.env['PGSSLMODE'] = 'verify-full'
      process.env['PGSSLCERT'] = certFilePath
      process.env['PGSSLKEY'] = keyFilePath
      process.env['PGSSLROOTCERT'] = caFilePath
    
      var subject = new ConnectionParameters()
      assert.equal(subject.host, 'local', 'env host')
      assert.equal(subject.user, 'bmc2', 'env user')
      assert.equal(subject.port, 7890, 'env port')
      assert.equal(subject.database, 'allyerbase', 'env database')
      assert.equal(subject.password, 'open', 'env password')

      assert.equal(typeof subject.ssl, 'object', 'env ssl')
      assert.equal(subject.ssl.cert, certFileContents, 'env ssl cert')
      assert.equal(subject.ssl.key, keyFileContents, 'env ssl key')
      assert.equal(subject.ssl.ca, caFileContents, 'env ssl ca')
    })
})

suite.test('ConnectionParameters initialized from mix', function () {
  clearEnv()
  process.env['PGHOST'] = 'local'
  process.env['PGUSER'] = 'bmc2'
  process.env['PGPORT'] = 7890
  process.env['PGDATABASE'] = 'allyerbase'
  process.env['PGPASSWORD'] = 'open'
  delete process.env['PGPASSWORD']
  delete process.env['PGDATABASE']
  var subject = new ConnectionParameters({
    user: 'testing',
    database: 'zugzug',
  })
  assert.equal(subject.host, 'local', 'env host')
  assert.equal(subject.user, 'testing', 'config user')
  assert.equal(subject.port, 7890, 'env port')
  assert.equal(subject.database, 'zugzug', 'config database')
  assert.equal(subject.password, defaults.password, 'defaults password')
  assert.equal(subject.ssl, false, 'ssl')
})

suite.test('ConnectionParameters initialized from mix - ssl', function () {
  createTempTlsFilesAndExecute(function(
    certFilePath, keyFilePath, caFilePath, 
    certFileContents, keyFileContents, caFileContents
  ) {
    clearEnv()
    process.env['PGHOST'] = 'local'
    process.env['PGUSER'] = 'bmc2'
    process.env['PGPORT'] = 7890
    process.env['PGDATABASE'] = 'allyerbase'
    process.env['PGPASSWORD'] = 'open'
    process.env['PGSSLMODE'] = 'verify-full'
    process.env['PGSSLCERT'] = certFilePath
    process.env['PGSSLKEY'] = keyFilePath
    delete process.env['PGPASSWORD']
    delete process.env['PGDATABASE']

    var subject = new ConnectionParameters({
      // The connection string will mostly override this config. See ConnectionParameters constructor.
      user: 'testing',
      database: 'zugzug',
      ssl: {
        ca: caFileContents
      },
      connectionString: "postgres://user2:pass2@host2:9999/db2"
    })
    assert.equal(subject.host, 'host2', 'string host')
    assert.equal(subject.user, 'user2', 'string user')
    assert.equal(subject.port, 9999, 'string port')
    assert.equal(subject.database, 'db2', 'string database')
    assert.equal(subject.password, 'pass2', 'string password')

    assert.equal(typeof subject.ssl, 'object', 'env ssl')
    assert.equal(subject.ssl.cert, certFileContents, 'env ssl cert')
    assert.equal(subject.ssl.key, keyFileContents, 'env ssl key')
    assert.equal(subject.ssl.ca, caFileContents, 'config ssl ca')
  })
})

suite.test('ConnectionParameters initialized from config - ssl', function () {
  createTempTlsFilesAndExecute(function(
    certFilePath, keyFilePath, caFilePath, 
    certFileContents, keyFileContents, caFileContents
  ) {
    clearEnv()
    var subject = new ConnectionParameters({
      host: 'local',
      user: 'testing',
      password: 'open',
      port: 7890,
      database: 'zugzug',
      ssl: {
        cert: certFileContents,
        key: keyFileContents,
        ca: caFileContents
      }
    })
    assert.equal(subject.host, 'local', 'env host')
    assert.equal(subject.user, 'testing', 'config user')
    assert.equal(subject.port, 7890, 'env port')
    assert.equal(subject.database, 'zugzug', 'config database')
    assert.equal(subject.password, 'open', 'defaults password')

    assert.equal(typeof subject.ssl, 'object', 'config ssl')
    assert.equal(subject.ssl.cert, certFileContents, 'config ssl cert')
    assert.equal(subject.ssl.key, keyFileContents, 'config ssl key')
    assert.equal(subject.ssl.ca, caFileContents, 'config ssl ca')
  })
})

suite.test('connection string parsing', function () {
  clearEnv()
  var string = 'postgres://brian:pw@boom:381/lala'
  var subject = new ConnectionParameters(string)
  assert.equal(subject.host, 'boom', 'string host')
  assert.equal(subject.user, 'brian', 'string user')
  assert.equal(subject.password, 'pw', 'string password')
  assert.equal(subject.port, 381, 'string port')
  assert.equal(subject.database, 'lala', 'string database')
  assert.equal(subject.ssl, false, 'ssl')
})

suite.test('connection string parsing - ssl', function () {
  // clear process.env
  clearEnv()

  var string = 'postgres://brian:pw@boom:381/lala?ssl=true'
  var subject = new ConnectionParameters(string)
  assert.equal(subject.ssl, true, 'ssl')

  string = 'postgres://brian:pw@boom:381/lala?ssl=1'
  subject = new ConnectionParameters(string)
  assert.equal(subject.ssl, true, 'ssl')

  string = 'postgres://brian:pw@boom:381/lala?other&ssl=true'
  subject = new ConnectionParameters(string)
  assert.equal(subject.ssl, true, 'ssl')

  string = 'postgres://brian:pw@boom:381/lala?ssl=0'
  subject = new ConnectionParameters(string)
  assert.equal(!!subject.ssl, false, 'ssl')

  string = 'postgres://brian:pw@boom:381/lala'
  subject = new ConnectionParameters(string)
  assert.equal(!!subject.ssl, false, 'ssl')

  string = 'postgres://brian:pw@boom:381/lala?ssl=no-verify'
  subject = new ConnectionParameters(string)
  assert.deepStrictEqual(subject.ssl, { rejectUnauthorized: false }, 'ssl')
})

suite.test('ssl is false by default', function () {
  clearEnv()
  var subject = new ConnectionParameters()
  assert.equal(subject.ssl, false)
})

// Create temp TLS certificate-mock files and run test logic inside this context
function createTempTlsFilesAndExecute(callback) {
  tmp.dir(function _tempDirCreated(err, tmpdir) {
    if (err) throw err;
    
    const certFilePath = tmpdir + '/client.crt'
    const keyFilePath = tmpdir + '/client.key'
    const caFilePath = tmpdir + '/ca.crt'

    const certFileContents = 'client cert file'
    const keyFileContents = 'client key file'
    const caFileContents = 'CA cert file'

    fs.appendFileSync(certFilePath, certFileContents, function (err) {
      if (err) throw err;
    })    
    fs.appendFileSync(keyFilePath, keyFileContents, function (err) {
      if (err) throw err;
    })    
    fs.appendFileSync(caFilePath, caFileContents, function (err) {
      if (err) throw err;
    })

    callback(certFilePath, keyFilePath, caFilePath, certFileContents, keyFileContents, caFileContents)
  })
}

var testVal = function (mode, expected) {
  suite.test('ssl is ' + expected + ' when $PGSSLMODE=' + mode, function () {
    clearEnv()
    process.env.PGSSLMODE = mode
    var subject = new ConnectionParameters()
    assert.deepStrictEqual(subject.ssl, expected)
  })
}

testVal('', false)
testVal('disable', false)
testVal('allow', false)
testVal('prefer', true)
testVal('require', true)
testVal('verify-ca', true)
testVal('verify-full', true)
testVal('no-verify', { rejectUnauthorized: false })

// restore process.env
for (var key in realEnv) {
  process.env[key] = realEnv[key]
}
