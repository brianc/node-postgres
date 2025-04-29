const assert = require('assert'),
  path = require('path'),
  pgPass = require(path.join('..', 'lib', 'index'))
const conn = {
  host: 'host4',
  port: 100,
  database: 'database4',
  user: 'user4',
}

describe('#1', function () {
  it('should handle escaping right', function (done) {
    process.env.PGPASSFILE = path.join(__dirname, '_pgpass')
    pgPass(conn, function (res) {
      assert.strictEqual('some:wired:password', res)
      done()
    })
  })
})
