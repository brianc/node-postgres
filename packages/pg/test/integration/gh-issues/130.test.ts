import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'
import assert from 'node:assert'
import { exec } from 'node:child_process'

;(helper.pg.defaults as { poolIdleTimeout?: number }).poolIdleTimeout = 1000

describe('130', () => {
  it('130', async () => {
    const pool = new helper.pg.Pool()
    pool.connect(function (err, client, done) {
      assert.ifError(err)
      client.once('error', function (err) {
        client.on('error', (_err) => {})
        done(err as never)
      })
      client.query('SELECT pg_backend_pid()', function (err, result) {
        assert.ifError(err)
        const pid = result.rows[0].pg_backend_pid
        let psql = 'psql'
        if (helper.args.host) psql = psql + ' -h ' + helper.args.host
        if (helper.args.port) psql = psql + ' -p ' + helper.args.port
        if (helper.args.user) psql = psql + ' -U ' + helper.args.user
        exec(
          psql + ' -c "select pg_terminate_backend(' + pid + ')" template1',
          assert.calls(function (error, _stdout, _stderr) {
            assert.ifError(error)
          })
        )
      })
    })
  })
})
