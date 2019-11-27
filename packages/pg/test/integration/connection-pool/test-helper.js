'use strict'
var helper = require('./../test-helper')

const suite = new helper.Suite()

helper.testPoolSize = function (max) {
  suite.test(`test ${max} queries executed on a pool rapidly`, (cb) => {
    const pool = new helper.pg.Pool({ max: 10 })

    var sink = new helper.Sink(max, function () {
      pool.end(cb)
    })

    for (var i = 0; i < max; i++) {
      pool.connect(function (err, client, done) {
        assert(!err)
        client.query('SELECT * FROM NOW()')
        client.query('select generate_series(0, 25)', function (err, result) {
          assert.equal(result.rows.length, 26)
        })
        var query = client.query('SELECT * FROM NOW()', (err) => {
          assert(!err)
          sink.add()
          done()
        })
      })
    }
  })
}

module.exports = Object.assign({}, helper, { suite: suite })
