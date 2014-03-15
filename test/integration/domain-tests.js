var helper = require('./test-helper')
var async = require('async')

var testWithoutDomain = function(cb) {
  test('no domain', function() {
    assert(!process.domain)
    helper.pg.connect(helper.config, assert.success(function(client, done) {
      assert(!process.domain)
      done()
      cb()
    }))
  })
}

var testWithDomain = function(cb) {
  test('with domain', function() {
    assert(!process.domain)
    var domain = require('domain').create()
    domain.run(function() {
      var startingDomain = process.domain
      assert(startingDomain)
      helper.pg.connect(helper.config, assert.success(function(client, done) {
        assert(process.domain, 'no domain exists in connect callback')
        assert.equal(startingDomain, process.domain, 'domain was lost when checking out a client')
        var query = client.query('SELECT NOW()', assert.success(function() {
          assert(process.domain, 'no domain exists in query callback')
          assert.equal(startingDomain, process.domain, 'domain was lost when checking out a client')
          done(true)
          process.domain.exit()
          cb()
        }))
      }))
    })
  })
}

var testErrorWithDomain = function(cb) {
  test('error on domain', function() {
    var domain = require('domain').create()
    domain.on('error', function() {
      cb()
    })
    domain.run(function() {
      helper.pg.connect(helper.config, assert.success(function(client, done) {
        client.query('SELECT SLDKJFLSKDJF')
        client.on('drain', done)
      }))
    })
  })
}

async.series([
  testWithoutDomain,
  testWithDomain,
  testErrorWithDomain
], function() {
  helper.pg.end()
})
