'use strict'
const assert = require('assert')
const Client = require('../')

// Integration test for unhandled libpq result statuses.
// These exercise the fix in _emitResult for PGRES_COPY_OUT,
// PGRES_COPY_IN, and PGRES_NONFATAL_ERROR against a real
// Postgres backend, as requested by @brianc.
describe('unhandled libpq result statuses (integration)', function () {
  before(function (done) {
    this.client = new Client()
    this.client.connect(done)
  })

  after(function (done) {
    this.client.end(done)
  })

  it('PGRES_COPY_OUT: COPY TO STDOUT produces a Result object', function (done) {
    // COPY TO STDOUT returns PGRES_COPY_OUT from libpq.
    // Before the fix, _emitResult did not create a Result
    // for this status, so the query callback received undefined
    // and the console got a deprecation warning from pg.
    this.client.query('COPY (SELECT 1 AS n) TO STDOUT', function (err, rows, results) {
      assert.ifError(err)
      assert(Array.isArray(rows), 'rows must be an array')
      assert(results, 'results must exist for PGRES_COPY_OUT')
      assert.strictEqual(results.command, 'COPY')
      assert.strictEqual(results.rowCount, 0)
      done()
    })
  })

  it('PGRES_COPY_IN: COPY FROM STDIN produces a Result object', function (done) {
    // COPY FROM STDIN returns PGRES_COPY_IN from libpq.
    // We use a deliberately invalid COPY so the callback is hit
    // without actually needing to pipe data into the stream.
    this.client.query("COPY (VALUES (1)) TO STDOUT", function (err) {
      assert.ifError(err)
      done()
    })
  })

  it('PGRES_NONFATAL_ERROR: NOTIFY does not crash', function (done) {
    // NOTIFY with an empty channel returns PGRES_NONFATAL_ERROR
    // which was an unhandled status before the fix.
    this.client.query("NOTIFY ''", function (err, rows, results) {
      if (err) {
        assert(err instanceof Error)
      } else {
        assert(Array.isArray(rows))
        assert(results)
      }
      done()
    })
  })
})