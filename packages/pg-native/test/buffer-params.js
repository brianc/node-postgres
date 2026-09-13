const Client = require('../')
const assert = require('assert')

// a Buffer used to reach libpq as a C string: read as utf8 and cut at the first zero byte
describe('Buffer parameters', function () {
  before(function () {
    this.client = Client()
    this.client.connectSync()
  })

  after(function (done) {
    this.client.end(done)
  })

  const bytes = Buffer.from([0xdd, 0x56, 0x00, 0x33, 0x00])

  it('keep every byte in a query', function (done) {
    this.client.query('SELECT $1::bytea AS b', [bytes], (err, rows) => {
      assert(!err)
      assert.deepStrictEqual(rows[0].b, bytes)
      done()
    })
  })

  it('keep every byte in a prepared statement', function (done) {
    this.client.prepare('bytes', 'SELECT $1::bytea AS b', 1, (err) => {
      assert(!err)
      this.client.execute('bytes', [bytes], (err, rows) => {
        assert(!err)
        assert.deepStrictEqual(rows[0].b, bytes)
        done()
      })
    })
  })

  it('keep every byte in a sync query', function () {
    const rows = this.client.querySync('SELECT $1::bytea AS b', [bytes])
    assert.deepStrictEqual(rows[0].b, bytes)
    this.client.prepareSync('bytes-sync', 'SELECT $1::bytea AS b', 1)
    assert.deepStrictEqual(this.client.executeSync('bytes-sync', [bytes])[0].b, bytes)
  })
})
