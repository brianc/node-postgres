const assert = require('assert')
const Cursor = require('../')
const pg = require('pg')

const text = 'SELECT generate_series as num FROM generate_series(0, 50)'
describe('close', function () {
  beforeEach(function (done) {
    const client = (this.client = new pg.Client())
    client.connect(done)
  })

  this.afterEach(function (done) {
    this.client.end(done)
  })

  it('can close a finished cursor without a callback', function (done) {
    const cursor = new Cursor(text)
    this.client.query(cursor)
    this.client.query('SELECT NOW()', done)
    cursor.read(100, function (err) {
      assert.ifError(err)
      cursor.close()
    })
  })

  it('can close a finished cursor a promise', function (done) {
    const cursor = new Cursor(text)
    this.client.query(cursor)
    cursor.read(100, (err) => {
      assert.ifError(err)
      cursor.close().then(() => {
        this.client.query('SELECT NOW()', done)
      })
    })
  })

  it('closes cursor early', function (done) {
    const cursor = new Cursor(text)
    this.client.query(cursor)
    this.client.query('SELECT NOW()', done)
    cursor.read(25, function (err) {
      assert.ifError(err)
      cursor.close()
    })
  })

  it('works with callback style', function (done) {
    const cursor = new Cursor(text)
    const client = this.client
    client.query(cursor)
    cursor.read(25, function (err, rows) {
      assert.ifError(err)
      assert.strictEqual(rows.length, 25)
      cursor.close(function (err) {
        assert.ifError(err)
        client.query('SELECT NOW()', done)
      })
    })
  })

  it('is a no-op to "close" the cursor before submitting it', function (done) {
    const cursor = new Cursor(text)
    cursor.close(done)
  })
})
