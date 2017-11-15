'use strict'
var helper = require('./test-helper')
const pg = helper.pg

// first make pool hold 2 clients
pg.defaults.poolSize = 2

const pool = new pg.Pool()

const suite = new helper.Suite()
suite.test('connecting to invalid port', (cb) => {
  const pool = new pg.Pool({ port: 13801 })
  pool.connect().catch(e => cb())
})

suite.test('errors emitted on pool', (cb) => {
  // get first client
  pool.connect(assert.success(function (client, done) {
    client.id = 1
    client.query('SELECT NOW()', function () {
      pool.connect(assert.success(function (client2, done2) {
        client2.id = 2
        var pidColName = 'procpid'
        helper.versionGTE(client2, 90200, assert.success(function (isGreater) {
          var killIdleQuery = 'SELECT pid, (SELECT pg_terminate_backend(pid)) AS killed FROM pg_stat_activity WHERE state = $1'
          var params = ['idle']
          if (!isGreater) {
            killIdleQuery = 'SELECT procpid, (SELECT pg_terminate_backend(procpid)) AS killed FROM pg_stat_activity WHERE current_query LIKE $1'
            params = ['%IDLE%']
          }

          pool.once('error', (err, brokenClient) => {
            assert.ok(err)
            assert.ok(brokenClient)
            assert.equal(client.id, brokenClient.id)
            cb()
          })

          // kill the connection from client
          client2.query(killIdleQuery, params, assert.success(function (res) {
            // check to make sure client connection actually was killed
            // return client2 to the pool
            done2()
            pool.end()
          }))
        }))
      }))
    })
  }))
})
