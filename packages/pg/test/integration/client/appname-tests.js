'use strict'
const helper = require('./test-helper')
const Client = helper.Client
const assert = require('assert')

const suite = new helper.Suite()

const conInfo = helper.config

function getConInfo(override) {
  return Object.assign({}, conInfo, override)
}

function getAppName(conf, cb) {
  const client = new Client(conf)
  client.connect(
    assert.success(function () {
      client.query(
        'SHOW application_name',
        assert.success(function (res) {
          const appName = res.rows[0].application_name
          cb(appName)
          client.end()
        })
      )
    })
  )
}

suite.test('No default appliation_name ', function (done) {
  getAppName({}, function (res) {
    assert.strictEqual(res, '')
    done()
  })
})

suite.test('fallback_application_name is used', function (done) {
  const fbAppName = 'this is my app'
  const conf = getConInfo({
    fallback_application_name: fbAppName,
  })
  getAppName(conf, function (res) {
    assert.strictEqual(res, fbAppName)
    done()
  })
})

suite.test('application_name is used', function (done) {
  const appName = 'some wired !@#$% application_name'
  const conf = getConInfo({
    application_name: appName,
  })
  getAppName(conf, function (res) {
    assert.strictEqual(res, appName)
    done()
  })
})

suite.test('application_name has precedence over fallback_application_name', function (done) {
  const appName = 'some wired !@#$% application_name'
  const fbAppName = 'some other strange $$test$$ appname'
  const conf = getConInfo({
    application_name: appName,
    fallback_application_name: fbAppName,
  })
  getAppName(conf, function (res) {
    assert.strictEqual(res, appName)
    done()
  })
})

suite.test('application_name from connection string', function (done) {
  const appName = 'my app'
  const conParams = require('../../../lib/connection-parameters')
  let conf
  if (process.argv[2]) {
    conf = new conParams(process.argv[2] + '?application_name=' + appName)
  } else {
    conf = 'postgres://?application_name=' + appName
  }
  getAppName(conf, function (res) {
    assert.strictEqual(res, appName)
    done()
  })
})

// TODO: make the test work for native client too
if (!helper.args.native) {
  suite.test('application_name is read from the env', function (done) {
    const appName = (process.env.PGAPPNAME = 'testest')
    getAppName({}, function (res) {
      delete process.env.PGAPPNAME
      assert.strictEqual(res, appName)
      done()
    })
  })
}
