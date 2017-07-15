'use strict'
var helper = require('../test-helper')
const pool = new helper.pg.Pool()

pool.connect(function (err, client) {
  var q = {
    name: 'This is a super long query name just so I can test that an error message is properly spit out to console.error without throwing an exception or anything',
    text: 'SELECT NOW()'
  }
  client.query(q, function () {
    client.end()
  })
})
