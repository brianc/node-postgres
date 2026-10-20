'use strict'
const assert = require('assert')
const Client = require('../')
const concat = require('concat-stream')

// Integration test for the libpq result statuses that used to finish a
// callback query without building a Result object, run against a real
// Postgres backend. The unit tests cover _emitResult with stubs; these
// tests make sure a real COPY round trip leaves the query callback with
// a usable Result object.
//
// Note: the query callbacks below intentionally avoid throwing. They run
// inside the libpq readable event, and an exception thrown there corrupts
// the connection, so the assertions run once the copy stream has finished.
//
// Each test uses its own client: after a COPY TO STDOUT has been drained
// through the copy stream, libpq still has the trailing result pending, so
// the connection is not reusable for the next callback query (this matches
// the behavior on master and is independent of this fix).
describe('unhandled libpq result statuses (integration)', function () {
  beforeEach(function (done) {
    this.client = new Client()
    this.client.connect(done)
  })

  afterEach(function () {
    this.client.end()
  })

  it('gives the query callback a Result for COPY TO STDOUT', function (done) {
    const client = this.client
    client.query('COPY (SELECT 1 AS n) TO STDOUT', function (err, rows, result) {
      // consume the copy data so the copy completes
      const stream = client.getCopyStream()
      stream.read()
      stream.pipe(
        concat(function (buf) {
          assert.ifError(err)
          // PGRES_COPY_OUT used to finish without building a Result,
          // leaving the callback with an undefined result.
          assert(result, 'expected a result object for PGRES_COPY_OUT')
          assert.deepStrictEqual(rows, [])
          assert.deepStrictEqual(result.rows, [])
          assert.strictEqual(buf.toString('utf8'), '1\n')
          done()
        })
      )
    })
  })

  it('gives the query callback a Result for COPY FROM STDIN', function (done) {
    const client = this.client
    client.querySync('CREATE TEMP TABLE unhandled_status_copy (name text)')
    client.query('COPY unhandled_status_copy FROM STDIN', function (err, rows, result) {
      // feed the copy data and let the copy finish
      const stream = client.getCopyStream()
      stream.write(Buffer.from('brian\n', 'utf8'))
      stream.end()
      stream.once('finish', function () {
        assert.ifError(err)
        // PGRES_COPY_IN used to finish without building a Result,
        // leaving the callback with an undefined result.
        assert(result, 'expected a result object for PGRES_COPY_IN')
        assert.deepStrictEqual(rows, [])
        const countRows = client.querySync('SELECT count(*) AS count FROM unhandled_status_copy')
        // count is a bigint, which the driver reports as a string
        assert.strictEqual(countRows[0].count, '1')
        // the copy substream consumed the trailing result, so the
        // connection accepts another callback query afterwards
        client.query('SELECT 41 AS n', function (err2, rows2, result2) {
          assert.ifError(err2)
          assert.strictEqual(result2.command, 'SELECT')
          assert.strictEqual(rows2.length, 1)
          done()
        })
      })
    })
  })
})
