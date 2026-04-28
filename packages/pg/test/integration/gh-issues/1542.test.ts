import { describe, it } from 'vitest'
import helper from './../_test-helper.ts'
import assert from 'node:assert'

describe('1542', () => {
  it('BoundPool can be subclassed', async () => {
    const Pool = helper.pg.Pool
    class SubPool extends Pool {}
    const subPool = new SubPool()
    const client = await subPool.connect()
    client.release()
    await subPool.end()
    assert(subPool instanceof helper.pg.Pool)
  })

  it('calling pg.Pool without new throws', () => {
    const Pool = helper.pg.Pool
    assert.throws(() => {
      Pool()
    })
  })
})
