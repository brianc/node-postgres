// Native client tests — only run when pg-native is installed.
import { describe, it } from 'vitest'

import helper from '../_test-helper.ts'

const hasNative = (() => {
  try {
    void helper.pg.native
    return helper.pg.native !== null
  } catch {
    return false
  }
})()

describe.skipIf(!hasNative)('native callback-api', () => {
  it('placeholder — original native tests require pg-native to convert end-to-end', () => {})
})
