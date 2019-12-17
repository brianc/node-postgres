'use strict'
var helper = require(__dirname + '/../test-helper')
var pg = helper.pg

new helper.Suite().test('parsing array results', function (cb) {
  const pool = new pg.Pool()
  pool.connect(assert.success(function (client, done) {
    client.query('CREATE TEMP TABLE test_table(bar integer, "baz\'s" integer)')
    client.query('INSERT INTO test_table(bar, "baz\'s") VALUES(1, 1), (2, 2)')
    client.query('SELECT * FROM test_table', function (err, res) {
      assert.equal(res.rows[0]["baz's"], 1)
      assert.equal(res.rows[1]["baz's"], 2)
      done()
      pool.end(cb)
    })
  }))
})
