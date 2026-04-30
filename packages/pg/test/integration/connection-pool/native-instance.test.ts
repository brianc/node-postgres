import { describe, it } from 'vitest'
import helper from './../_test-helper.ts'
import assert from 'node:assert'

describe('native-instance', () => {
  it('native-instance', async () => {
    const pg = helper.pg
    const native = false

    const pool = new pg.Pool()

    pool.connect(
      assert.calls(function (err, client, done) {
        console.log('native?', native)
        if (native) {
          assert((client as { native?: unknown }).native)
        } else {
          assert(!(client as { native?: unknown }).native)
        }
        done()
        pool.end()
      })
    )
  })
})
