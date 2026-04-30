import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('lifetime timeout', () => {
  it('connection lifetime should expire and remove the client', () =>
    new Promise<void>((resolve) => {
      const pool = new Pool({ maxLifetimeSeconds: 1 })
      pool.query('SELECT NOW()')
      pool.on('remove', () => {
        expect(pool.expiredCount).toBe(0)
        expect(pool.totalCount).toBe(0)
        resolve()
      })
    }))

  it('connection lifetime should expire and remove the client after the client is done working', () =>
    new Promise<void>((resolve) => {
      const pool = new Pool({ maxLifetimeSeconds: 1 })
      pool.query('SELECT pg_sleep(1.4)')
      pool.on('remove', () => {
        expect(pool.expiredCount).toBe(0)
        expect(pool.totalCount).toBe(0)
        resolve()
      })
    }))

  it('can remove expired clients and recreate them', async () => {
    const pool = new Pool({ maxLifetimeSeconds: 1 })
    const query = pool.query('SELECT pg_sleep(1.4)')
    expect(pool.expiredCount).toBe(0)
    expect(pool.totalCount).toBe(1)
    await query
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(pool.expiredCount).toBe(0)
    expect(pool.totalCount).toBe(0)
    await pool.query('SELECT NOW()')
    expect(pool.expiredCount).toBe(0)
    expect(pool.totalCount).toBe(1)
  })
})
