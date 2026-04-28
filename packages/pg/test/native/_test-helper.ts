import { createRequire } from 'node:module'

import helper from '../_test-helper.ts'

export * from '../_test-helper.ts'

const requireFn = createRequire(import.meta.url)

let NativeClient: unknown = null
try {
  NativeClient = requireFn('../../src/native/index.ts')
} catch {
  NativeClient = null
}

export const hasNative = NativeClient !== null
export { NativeClient }

export default helper
