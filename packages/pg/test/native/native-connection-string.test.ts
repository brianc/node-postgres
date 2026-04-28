import { describe, it } from 'vitest'

import helper from '../_test-helper.ts'

const hasNative = (() => {
  try {
    return helper.pg.native !== null
  } catch {
    return false
  }
})()

describe.skipIf(!hasNative)('native connection-string', () => {
  it('placeholder — requires pg-native', () => {})
})
