'use strict'
var helper = require('./test-helper')
var pg = helper.pg

const pool = new pg.Pool()
new helper.Suite().test('should return insert metadata', function () {
  pool.connect(assert.calls(function (err, client, done) {
    assert(!err)

    helper.versionGTE(client, 90000, assert.success(function (hasRowCount) {
      client.query('CREATE TEMP TABLE zugzug(name varchar(10))', assert.calls(function (err, result) {
        assert(!err)
        assert.equal(result.oid, null)
        assert.equal(result.command, 'CREATE')

        var q = client.query("INSERT INTO zugzug(name) VALUES('more work?')", assert.calls(function (err, result) {
          assert(!err)
          assert.equal(result.command, 'INSERT')
          assert.equal(result.rowCount, 1)

          client.query('SELECT * FROM zugzug', assert.calls(function (err, result) {
            assert(!err)
            if (hasRowCount) assert.equal(result.rowCount, 1)
            assert.equal(result.command, 'SELECT')
            done()
            process.nextTick(pool.end.bind(pool))
          }))
        }))
      }))
    }))
  }))
})
