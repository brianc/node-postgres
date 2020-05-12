'use strict'
var helper = require('../test-helper')
const Suite = require('../../suite')

var assert = require('assert')
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
