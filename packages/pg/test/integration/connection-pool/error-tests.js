'use strict'
var helper = require('./test-helper')
const pg = helper.pg
const native = helper.args.native

const suite = new helper.Suite()
suite.test('connecting to invalid port', (cb) => {
  const pool = new pg.Pool({ port: 13801 })
  pool.connect().catch((e) => cb())
})

suite.test('errors emitted on checked-out clients', (cb) => {
  // make pool hold 2 clients
  const pool = new pg.Pool({ max: 2 })
  // get first client
  pool.connect(
    assert.success(function (client, done) {
      client.query('SELECT NOW()', function () {
        pool.connect(
          assert.success(function (client2, done2) {
            var pidColName = 'procpid'
            helper.versionGTE(
              client2,
              90200,
              assert.success(function (isGreater) {
                var killIdleQuery =
                  'SELECT pid, (SELECT pg_terminate_backend(pid)) AS killed FROM pg_stat_activity WHERE state = $1'
                var params = ['idle']
                if (!isGreater) {
                  killIdleQuery =
                    'SELECT procpid, (SELECT pg_terminate_backend(procpid)) AS killed FROM pg_stat_activity WHERE current_query LIKE $1'
                  params = ['%IDLE%']
                }

                client.once('error', (err) => {
                  client.on('error', (err) => {})
                  done(err)
                  cb()
                })

                // kill the connection from client
                client2.query(
                  killIdleQuery,
                  params,
                  assert.success(function (res) {
                    // check to make sure client connection actually was killed
                    // return client2 to the pool
                    done2()
                    pool.end()
                  })
                )
              })
            )
          })
        )
      })
    })
  )
})

suite.test('connection-level errors cause queued queries to fail', (cb) => {
  const pool = new pg.Pool()
  pool.connect(
    assert.success((client, done) => {
      client.query(
        'SELECT pg_terminate_backend(pg_backend_pid())',
        assert.calls((err) => {
          if (helper.args.native) {
            assert.ok(err)
          } else {
            assert.equal(err.code, '57P01')
          }
        })
      )

      client.once(
        'error',
        assert.calls((err) => {
          client.on('error', (err) => {})
        })
      )

      client.query(
        'SELECT 1',
        assert.calls((err) => {
          if (helper.args.native) {
            assert.equal(err.message, 'terminating connection due to administrator command')
          } else {
            assert.equal(err.message, 'Connection terminated unexpectedly')
          }

          done(err)
          pool.end()
          cb()
        })
      )
    })
  )
})

suite.test('connection-level errors cause future queries to fail', (cb) => {
  const pool = new pg.Pool()
  pool.connect(
    assert.success((client, done) => {
      client.query(
        'SELECT pg_terminate_backend(pg_backend_pid())',
        assert.calls((err) => {
          if (helper.args.native) {
            assert.ok(err)
          } else {
            assert.equal(err.code, '57P01')
          }
        })
      )

      client.once(
        'error',
        assert.calls((err) => {
          client.on('error', (err) => {})
          client.query(
            'SELECT 1',
            assert.calls((err) => {
              if (helper.args.native) {
                assert.equal(err.message, 'terminating connection due to administrator command')
              } else {
                assert.equal(err.message, 'Client has encountered a connection error and is not queryable')
              }

              done(err)
              pool.end()
              cb()
            })
          )
        })
      )
    })
  )
})

suite.test('handles socket error during pool.query and destroys it immediately', (cb) => {
  const pool = new pg.Pool({ max: 1 })

  if (native) {
    pool.query('SELECT pg_sleep(10)', [], (err) => {
      assert.equal(err.message, 'canceling statement due to user request')
      cb()
    })

    setTimeout(() => {
      pool._clients[0].native.cancel((err) => {
        assert.ifError(err)
      })
    }, 100)
  } else {
    pool.query('SELECT pg_sleep(10)', [], (err) => {
      assert.equal(err.message, 'network issue')
      assert.equal(stream.destroyed, true)
      cb()
    })

    const stream = pool._clients[0].connection.stream
    setTimeout(() => {
      stream.emit('error', new Error('network issue'))
    }, 100)
  }
})
