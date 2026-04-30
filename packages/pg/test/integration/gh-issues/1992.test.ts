import { describe, it } from 'vitest'
import helper from './../_test-helper.ts'
import assert from 'node:assert'

describe('1992', () => {
  it('Native should not be enumerable', () => {
    const keys = Object.keys(helper.pg)
    assert.strictEqual(keys.indexOf('native'), -1)
  })
})
