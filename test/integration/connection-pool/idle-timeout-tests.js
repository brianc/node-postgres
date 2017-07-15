'use strict'
var helper = require('./test-helper')

new helper.Suite().test('idle timeout', function () {
  const config = Object.assign({}, helper.config, { idleTimeoutMillis: 50 })
  const pool = new helper.pg.Pool(config)
  pool.connect(assert.calls(function (err, client, done) {
    assert(!err)
    client.query('SELECT NOW()')
    done()
  }))
})
