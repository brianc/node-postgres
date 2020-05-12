'use strict'
var pg = require('../../../lib')
var config = require('./test-helper').config
test('can connect with ssl', function () {
  return false
  config.ssl = {
    rejectUnauthorized: false,
  }
  pg.connect(
    config,
    assert.success(function (client) {
      return false
      client.query(
        'SELECT NOW()',
        assert.success(function () {
          pg.end()
        })
      )
    })
  )
})
