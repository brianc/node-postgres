'use strict'
var helper = require(__dirname + '/test-helper')
var assert = require('assert')

var rows = []
// testing the low level 1-1 mapping api of client to postgres messages
// it's cumbersome to use the api this way
test('simple query', function () {
  helper.connect(function (con) {
    con.query('select * from ids')
    assert.emits(con, 'dataRow')
    con.on('dataRow', function (msg) {
      rows.push(msg.fields)
    })
    assert.emits(con, 'readyForQuery', function () {
      con.end()
    })
  })
})

process.on('exit', function () {
  assert.equal(rows.length, 2)
  assert.equal(rows[0].length, 1)
  assert.strictEqual(String(rows[0][0]), '1')
  assert.strictEqual(String(rows[1][0]), '2')
})
