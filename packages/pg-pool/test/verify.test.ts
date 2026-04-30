import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('verify', () => {
  it('verifies a client with a callback', () =>
    new Promise<void>((resolve) => {
      const pool = new Pool({
        verify: (_client, cb) => {
          cb(new Error('nope'))
        },
      })

      pool.connect((err) => {
        expect(err).toBeInstanceOf(Error)
        expect(err!.message).toBe('nope')
        pool.end()
        resolve()
      })
    }))
})
