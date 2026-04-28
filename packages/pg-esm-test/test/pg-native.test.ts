import { describe, it, expect } from 'vitest'

describe('pg-native', () => {
  it('exports Client constructor (when libpq is available)', async () => {
    try {
      const { default: Client } = (await import('pg-native' as string)) as { default: new () => unknown }
      expect(new Client()).toBeTruthy()
    } catch (err: unknown) {
      // pg-native is optional and requires libpq native binding
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
        return
      }
      throw err
    }
  })
})
