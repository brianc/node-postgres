'use strict'
var helper = require('./test-helper')
const pool = new helper.pg.Pool()

pool.connect(assert.success(function (client, done) {
  var types = require('pg-types')
  // 1231 = numericOID
  types.setTypeParser(1700, function () {
    return 'yes'
  })
  types.setTypeParser(1700, 'binary', function () {
    return 'yes'
  })
  var bignum = '294733346389144765940638005275322203805'
  client.query('CREATE TEMP TABLE bignumz(id numeric)')
  client.query('INSERT INTO bignumz(id) VALUES ($1)', [bignum])
  client.query('SELECT * FROM bignumz', assert.success(function (result) {
    assert.equal(result.rows[0].id, 'yes')
    done()
    pool.end()
  }))
}))
