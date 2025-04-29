const assert = require('assert'),
  path = require('path'),
  pgPass = require(path.join('..', 'lib', 'index'))
const conn = {
  host: 'host1',
  port: 100,
  database: 'somedb',
  user: 'user2',
}

describe('MAIN', function () {
  it('should ignore non existent file', function (done) {
    process.env.PGPASSFILE = path.join(__dirname, '_no_such_file_')
    pgPass(conn, function (res) {
      assert(undefined === res)
      done()
    })
  })

  it('should read .pgpass', function (done) {
    process.env.PGPASSFILE = path.join(__dirname, '_pgpass')
    pgPass(conn, function (res) {
      assert.strictEqual('pass2', res)
      done()
    })
  })

  it('should not read .pgpass because of PGPASSWORD', function (done) {
    process.env.PGPASSFILE = path.join(__dirname, '_pgpass')
    process.env.PGPASSWORD = 'something'
    pgPass(conn, function (res) {
      assert(undefined === res)
      delete process.env.PGPASSWORD
      done()
    })
  })
})
