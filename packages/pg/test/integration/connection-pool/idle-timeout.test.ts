import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('idle-timeout', () => {
  it('idle timeout', function () {
    const config = Object.assign({}, helper.config, { idleTimeoutMillis: 50 })
    const pool = new helper.pg.Pool(config)
    pool.connect(
      assert.calls(function (err, client, done) {
        assert(!err)
        client.query('SELECT NOW()')
        done()
      })
    )
  })
})
