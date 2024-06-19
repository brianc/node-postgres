'use strict'
var helper = require('../test-helper')
var Client = require('../../lib/native')
const suite = new helper.Suite()
const assert = require('assert')

suite.test('respects nativeConnectionString in config', function (done) {
  const realPort = helper.config.port
  const nativeConnectionString = `host=${helper.config.host} port=${helper.config.port} dbname=${helper.config.database} user=${helper.config.user} password=${helper.config.password}`

  // setting wrong port to make sure config is take from nativeConnectionString and not env
  helper.config.port = '90929'

  var client = new Client({
    ...helper.config,
    nativeConnectionString,
  })

  client.connect(function (err) {
    assert(!err)
    client.query(
      'SELECT 1 as num',
      assert.calls(function (err, result) {
        assert(!err)
        assert.equal(result.rows[0].num, 1)
        assert.strictEqual(result.rowCount, 1)
        // restore post in case helper config will be reused
        helper.config.port = realPort
        client.end(done)
      })
    )
  })
})

suite.test('respects nativeConnectionString in config even when it is corrupted', function (done) {
  const nativeConnectionString = `foobar`

  var client = new Client({
    nativeConnectionString,
  })

  client.connect(function (err) {
    assert(err)
    assert.equal(
      err.message,
      'missing "=" after "foobar" in connection info string\n',
      'Connection error should have been thrown'
    )
    client.end(done)
  })
})
