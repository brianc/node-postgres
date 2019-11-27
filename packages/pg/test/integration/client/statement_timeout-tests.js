'use strict'
var helper = require('./test-helper')
var Client = helper.Client

var suite = new helper.Suite()

var conInfo = helper.config

function getConInfo (override) {
  return Object.assign({}, conInfo, override )
}

function getStatementTimeout (conf, cb) {
  var client = new Client(conf)
  client.connect(assert.success(function () {
    client.query('SHOW statement_timeout', assert.success(function (res) {
      var statementTimeout = res.rows[0].statement_timeout
      cb(statementTimeout)
      client.end()
    }))
  }))
}

if (!helper.args.native) { // statement_timeout is not supported with the native client
  suite.test('No default statement_timeout ', function (done) {
    getConInfo()
    getStatementTimeout({}, function (res) {
      assert.strictEqual(res, '0') // 0 = no timeout
      done()
    })
  })

  suite.test('statement_timeout integer is used', function (done) {
    var conf = getConInfo({
      'statement_timeout': 3000
    })
    getStatementTimeout(conf, function (res) {
      assert.strictEqual(res, '3s')
      done()
    })
  })

  suite.test('statement_timeout float is used', function (done) {
    var conf = getConInfo({
      'statement_timeout': 3000.7
    })
    getStatementTimeout(conf, function (res) {
      assert.strictEqual(res, '3s')
      done()
    })
  })

  suite.test('statement_timeout string is used', function (done) {
    var conf = getConInfo({
      'statement_timeout': '3000'
    })
    getStatementTimeout(conf, function (res) {
      assert.strictEqual(res, '3s')
      done()
    })
  })

  suite.test('statement_timeout actually cancels long running queries', function (done) {
    var conf = getConInfo({
      'statement_timeout': '10' // 10ms to keep tests running fast
    })
    var client = new Client(conf)
    client.connect(assert.success(function () {
      client.query('SELECT pg_sleep( 1 )', function ( error ) {
        client.end()
        assert.strictEqual( error.code, '57014' ) // query_cancelled
        done()
      })
    }))
  })
  
}
