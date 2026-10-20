'use strict'
const helper = require('./test-helper')
const Query = helper.pg.Query
const { Client } = helper
const assert = require('assert')

const suite = new helper.Suite()

suite.test('client end during query execution of prepared statement', function (done) {
  const client = new Client()
  client.connect(
    assert.success(function () {
      const sleepQuery = 'select pg_sleep($1)'

      const queryConfig = {
        name: 'sleep query',
        text: sleepQuery,
        values: [5],
      }

      const queryInstance = new Query(
        queryConfig,
        assert.calls(function (err, result) {
          assert.equal(err.message, 'Connection terminated')
          done()
        })
      )

      const query1 = client.query(queryInstance)

      query1.on('error', function (err) {
        assert.fail('Prepared statement should not emit error')
      })

      query1.on('row', function (row) {
        assert.fail('Prepared statement should not emit row')
      })

      query1.on('end', function (err) {
        assert.fail('Prepared statement when executed should not return before being killed')
      })

      client.end()
    })
  )
})

function killIdleQuery(targetQuery, cb) {
  const client2 = new Client(helper.args)
  let pidColName = 'procpid'
  let queryColName = 'current_query'
  client2.connect(
    assert.success(function () {
      helper.versionGTE(
        client2,
        90200,
        assert.success(function (isGreater) {
          if (isGreater) {
            pidColName = 'pid'
            queryColName = 'query'
          }
          const killIdleQuery =
            'SELECT ' +
            pidColName +
            ', (SELECT pg_terminate_backend(' +
            pidColName +
            ')) AS killed FROM pg_stat_activity WHERE ' +
            queryColName +
            ' = $1'
          client2.query(
            killIdleQuery,
            [targetQuery],
            assert.calls(function (err, res) {
              assert.ifError(err)
              assert.equal(res.rows.length, 1)
              client2.end(cb)
              assert.emits(client2, 'end')
            })
          )
        })
      )
    })
  )
}

suite.test('query killed during query execution of prepared statement', function (done) {
  if (helper.args.native) {
    return done()
  }
  const client = new Client(helper.args)
  client.connect(
    assert.success(function () {
      const sleepQuery = 'select pg_sleep($1)'

      const queryConfig = {
        name: 'sleep query',
        text: sleepQuery,
        values: [5],
      }

      // client should emit an error because it is unexpectedly disconnected
      assert.emits(client, 'error')

      const query1 = client.query(
        new Query(queryConfig),
        assert.calls(function (err, result) {
          assert.equal(err.message, 'terminating connection due to administrator command')
        })
      )

      query1.on('error', function (err) {
        assert.fail('Prepared statement should not emit error')
      })

      query1.on('row', function (row) {
        assert.fail('Prepared statement should not emit row')
      })

      query1.on('end', function (err) {
        assert.fail('Prepared statement when executed should not return before being killed')
      })

      killIdleQuery(sleepQuery, done)
    })
  )
})

// When a query runs with the `rows` option, Execute is pipelined with Flush
// instead of Sync, so an ErrorResponse leaves the backend in ignore-till-sync:
// it discards every message until a Sync arrives and withholds ReadyForQuery.
// The client used to never send that Sync, so the query rejected correctly but
// the connection was wedged — every later query queued forever.
// https://github.com/brianc/node-postgres/issues/3707
suite.test('rows-limited query that errors mid-portal stays usable', function (done) {
  if (helper.args.native) {
    return done()
  }
  const client = new Client(helper.args)
  client.connect(
    assert.success(function () {
      // one ReadyForQuery per completed extended-protocol sequence — the
      // errored query and the follow-up, no more (a stray second Sync would
      // produce a third and desync the queue)
      let readyForQueryCount = 0
      client.connection.on('readyForQuery', function () {
        readyForQueryCount++
      })
      // divides by zero on row 5, fetched in pages of 2: the error arrives
      // between PortalSuspended round trips, with the portal still open
      client.query(
        { text: 'select 10 / (5 - i) as v from generate_series(1, 7) g(i)', rows: 2 },
        assert.calls(function (err) {
          assert.equal(err.message, 'division by zero')
          client.query(
            'select 41 + 1 as v',
            assert.calls(function (err, res) {
              assert.ifError(err)
              assert.equal(res.rows[0].v, 42)
              client.end(
                assert.success(function () {
                  assert.equal(readyForQueryCount, 2)
                  done()
                })
              )
            })
          )
        })
      )
    })
  )
})

suite.test('rows-limited query that errors before any row stays usable', function (done) {
  if (helper.args.native) {
    return done()
  }
  const client = new Client(helper.args)
  client.connect(
    assert.success(function () {
      let readyForQueryCount = 0
      client.connection.on('readyForQuery', function () {
        readyForQueryCount++
      })
      // rejected at Parse, before the portal is ever created
      client.query(
        { text: 'select 1; select 2', rows: 2 },
        assert.calls(function (err) {
          assert.equal(err.message, 'cannot insert multiple commands into a prepared statement')
          client.query(
            'select 41 + 1 as v',
            assert.calls(function (err, res) {
              assert.ifError(err)
              assert.equal(res.rows[0].v, 42)
              client.end(
                assert.success(function () {
                  assert.equal(readyForQueryCount, 2)
                  done()
                })
              )
            })
          )
        })
      )
    })
  )
})

// A row that throws while being parsed cancels the query client-side: the
// portal still ends with CommandComplete, which sends the owed Sync, and the
// error is only surfaced on ReadyForQuery. handleError must not send a second
// Sync for the same sequence — two ReadyForQuery frames would let the next
// query settle on the first one, mid-flight.
suite.test('rows-limited query that fails while parsing a row syncs once', function (done) {
  if (helper.args.native) {
    return done()
  }
  const client = new Client(helper.args)
  client.connect(
    assert.success(function () {
      let readyForQueryCount = 0
      client.connection.on('readyForQuery', function () {
        readyForQueryCount++
      })
      const query = {
        text: 'select 1 as v',
        rows: 1,
        types: {
          getTypeParser: function () {
            return function () {
              throw new Error('boom')
            }
          },
        },
      }
      client.query(
        query,
        assert.calls(function (err) {
          assert.equal(err.message, 'boom')
          client.query(
            'select 41 + 1 as v',
            assert.calls(function (err, res) {
              assert.ifError(err)
              assert.equal(res.rows[0].v, 42)
              client.end(
                assert.success(function () {
                  assert.equal(readyForQueryCount, 2)
                  done()
                })
              )
            })
          )
        })
      )
    })
  )
})
