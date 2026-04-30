import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('logging', () => {
  it('logs to supplied log function if given', () => {
    const messages: unknown[] = []
    const log = (msg: unknown) => {
      messages.push(msg)
    }
    const pool = new Pool({ log })
    return pool.query('SELECT NOW()').then(() => {
      expect(messages.length).toBeGreaterThan(0)
      return pool.end()
    })
  })
})
