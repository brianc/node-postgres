'use strict'
var helper = require('./test-helper')
const assert = require('assert')

// http://www.postgresql.org/docs/8.3/static/libpq-notify.html
test('recieves notification from same connection with no payload', function () {
  helper.connect(function (con) {
    con.query('LISTEN boom')
    assert.emits(con, 'readyForQuery', function () {
      con.query('NOTIFY boom')
      assert.emits(con, 'notification', function (msg) {
        assert.equal(msg.payload, '')
        assert.equal(msg.channel, 'boom')
        con.end()
      })
    })
  })
})
