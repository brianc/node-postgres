import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('error', () => {
  const pg = helper.pg
  const native = false
  it('connecting to invalid port', () =>
    new Promise<void>((cb) => {
      const pool = new pg.Pool({ port: 13801 })
      pool.connect().catch((e) => cb())
    }))

  it('errors emitted on checked-out clients', () =>
    new Promise<void>((cb) => {
      // make pool hold 2 clients
      const pool = new pg.Pool({ max: 2 })
      // get first client
      pool.connect(
        assert.success(function (client, done) {
          client.query('SELECT NOW()', function () {
            pool.connect(
              assert.success(function (client2, done2) {
                helper.versionGTE(
                  client2,
                  90200,
                  assert.success(function (isGreater) {
                    let killIdleQuery =
                      'SELECT pid, (SELECT pg_terminate_backend(pid)) AS killed FROM pg_stat_activity WHERE state = $1'
                    let params = ['idle']
                    if (!isGreater) {
                      killIdleQuery =
                        'SELECT procpid, (SELECT pg_terminate_backend(procpid)) AS killed FROM pg_stat_activity WHERE current_query LIKE $1'
                      params = ['%IDLE%']
                    }

                    client.once('error', (err: Error) => {
                      client.on('error', (err: Error) => {})
                      done(err as never)
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
    }))

  it('connection-level errors cause queued queries to fail', () =>
    new Promise<void>((cb) => {
      const pool = new pg.Pool()
      pool.connect(
        assert.success((client, done) => {
          client.query(
            'SELECT pg_terminate_backend(pg_backend_pid())',
            assert.calls((err: Error) => {
              if (false) {
                assert.ok(err)
              } else {
                assert.equal((err as Error & { code?: string }).code, '57P01')
              }
            })
          )

          client.once(
            'error',
            assert.calls((err: Error) => {
              client.on('error', (err: Error) => {})
            })
          )

          client.query(
            'SELECT 1',
            assert.calls((err: Error) => {
              if (false) {
                assert.equal(err.message, 'terminating connection due to administrator command')
              } else {
                assert.equal(err.message, 'Connection terminated unexpectedly')
              }

              done(err as never)
              pool.end()
              cb()
            })
          )
        })
      )
    }))

  it('connection-level errors cause future queries to fail', () =>
    new Promise<void>((cb) => {
      const pool = new pg.Pool()
      pool.connect(
        assert.success((client, done) => {
          client.query(
            'SELECT pg_terminate_backend(pg_backend_pid())',
            assert.calls((err: Error) => {
              if (false) {
                assert.ok(err)
              } else {
                assert.equal((err as Error & { code?: string }).code, '57P01')
              }
            })
          )

          client.once(
            'error',
            assert.calls((err: Error) => {
              client.on('error', (err: Error) => {})
              client.query(
                'SELECT 1',
                assert.calls((err: Error) => {
                  if (false) {
                    assert.equal(err.message, 'terminating connection due to administrator command')
                  } else {
                    assert.equal(err.message, 'Client has encountered a connection error and is not queryable')
                  }

                  done(err as never)
                  pool.end()
                  cb()
                })
              )
            })
          )
        })
      )
    }))

  it('handles socket error during pool.query and destroys it immediately', () =>
    new Promise<void>((cb) => {
      const pool = new pg.Pool({ max: 1 })

      if (native) {
        pool.query('SELECT pg_sleep(10)', [], (err: Error | undefined) => {
          assert.equal(err!.message, 'canceling statement due to user request')
          cb()
        })

        setTimeout(() => {
          ;(pool._clients[0] as unknown as { native: { cancel: (cb: (err?: Error) => void) => void } }).native.cancel(
            (err) => {
              assert.ifError(err)
            }
          )
        }, 100)
      } else {
        pool.query('SELECT pg_sleep(10)', [], (err: Error | undefined) => {
          assert.equal(err!.message, 'network issue')
          assert.equal((stream as unknown as { destroyed: boolean }).destroyed, true)
          cb()
        })

        const stream = pool._clients[0].connection!.stream as unknown as {
          destroy: () => void
          emit: (event: string, ...args: unknown[]) => void
        }
        setTimeout(() => {
          stream.emit('error', new Error('network issue'))
        }, 100)
      }
    }))
})
