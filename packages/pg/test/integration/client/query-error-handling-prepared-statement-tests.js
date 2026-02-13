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
