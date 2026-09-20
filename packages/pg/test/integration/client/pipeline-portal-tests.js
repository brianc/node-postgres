'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const pg = helper.pg

// A portal stays open across round trips, so on a pipelined connection the queries written behind
// it were answered out of that portal: rows arrived on the wrong query, later reads failed with
// 'portal does not exist' and pg-cursor crashed on a null row buffer. These must be refused.
const suite = new helper.Suite('pipeline mode portal queries')

if (helper.args.native) {
  return
}

// stands in for pg-cursor and pg-query-stream, so the test does not need either package
class FakeCursor {
  constructor() {
    this.error = null
  }
  submit() {}
  handleError(err) {
    this.error = err
    if (this.onError) this.onError(err)
  }
}

suite.test('rejects a custom query class', (done) => {
  const client = new pg.Client({ pipeline: true })
  client.connect((err) => {
    if (err) return done(err)
    const cursor = client.query(new FakeCursor())
    cursor.onError = (err) => {
      assert.ok(/pipeline mode/.test(err.message), `expected a pipeline mode error, got: ${err.message}`)
      client.end(done)
    }
  })
})

suite.test('rejects the rows option', (done) => {
  const client = new pg.Client({ pipeline: true })
  client.connect((err) => {
    if (err) return done(err)
    client
      .query({ text: 'SELECT generate_series(1, 10) as num', rows: 3 })
      .then(() => {
        client.end(() => done(new Error('a paged query should not be accepted in pipeline mode')))
      })
      .catch((err) => {
        assert.ok(/pipeline mode/.test(err.message), `expected a pipeline mode error, got: ${err.message}`)
        client.end(done)
      })
  })
})

suite.test('accepts both when pipeline mode is off', (done) => {
  const client = new pg.Client()
  client.connect((err) => {
    if (err) return done(err)
    client
      .query({ text: 'SELECT generate_series(1, 10) as num', rows: 3 })
      .then((res) => {
        assert.equal(res.rows.length, 10)
        client.end(done)
      })
      .catch((err) => client.end(() => done(err)))
  })
})

suite.test('leaves normal queries alone', (done) => {
  const client = new pg.Client({ pipeline: true })
  client.connect((err) => {
    if (err) return done(err)
    Promise.all([1, 2, 3].map((i) => client.query('SELECT $1::int as v', [i])))
      .then((results) => {
        assert.deepStrictEqual(
          results.map((r) => Number(r.rows[0].v)),
          [1, 2, 3]
        )
        client.end(done)
      })
      .catch((err) => client.end(() => done(err)))
  })
})
