'use strict'
const helper = require('./../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

suite.testAsync('BoundPool can be subclassed', async () => {
  const Pool = helper.pg.Pool
  class SubPool extends Pool {}
  const subPool = new SubPool()
  const client = await subPool.connect()
  client.release()
  await subPool.end()
  assert(subPool instanceof helper.pg.Pool)
})

suite.test('calling pg.Pool without new throws', () => {
  const Pool = helper.pg.Pool
  assert.throws(() => {
    const pool = Pool()
  })
})
