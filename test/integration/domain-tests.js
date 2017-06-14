var async = require('async')

var helper = require('./test-helper')
var Query = helper.pg.Query
var suite = new helper.Suite()

suite.test('no domain', function (cb) {
  assert(!process.domain)
  helper.pg.connect(assert.success(function (client, done) {
    assert(!process.domain)
    done()
    cb()
  }))
})

suite.test('with domain', function (cb) {
  assert(!process.domain)
  var domain = require('domain').create()
  domain.run(function () {
    var startingDomain = process.domain
    assert(startingDomain)
    helper.pg.connect(helper.config, assert.success(function (client, done) {
      assert(process.domain, 'no domain exists in connect callback')
      assert.equal(startingDomain, process.domain, 'domain was lost when checking out a client')
      var query = client.query('SELECT NOW()', assert.success(function () {
        assert(process.domain, 'no domain exists in query callback')
        assert.equal(startingDomain, process.domain, 'domain was lost when checking out a client')
        done(true)
        process.domain.exit()
        cb()
      }))
    }))
  })
})

suite.test('error on domain', function (cb) {
  var domain = require('domain').create()
  domain.on('error', function () {
    cb()
  })
  domain.run(function () {
    helper.pg.connect(helper.config, assert.success(function (client, done) {
      client.query(new Query('SELECT SLDKJFLSKDJF'))
      client.on('drain', done)
    }))
  })
})

suite.test('cleanup', () => helper.pg.end())
