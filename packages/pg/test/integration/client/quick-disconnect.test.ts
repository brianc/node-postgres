import { describe, it } from 'vitest'
import assert from 'node:assert'
import helper from './_test-helper.ts'

describe('quick-disconnect', () => {
  it('quick-disconnect', async () => {
    // test for issue #320
    //

    const client = new helper.pg.Client(helper.config)
    client.connect()
    client.end()
  })
})
