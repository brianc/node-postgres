import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('pool ending', () => {
  it('ends without being used', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool()
      pool.end((err) => (err ? reject(err) : resolve()))
    }))

  it('ends with a promise', () => {
    return new Pool().end()
  })

  it('ends with clients', async () => {
    const pool = new Pool()
    const res: any = await pool.query('SELECT $1::text as name', ['brianc'])
    expect(res.rows[0].name).toBe('brianc')
    return pool.end()
  })

  it('allows client to finish', async () => {
    const pool = new Pool()
    const query = pool.query('SELECT $1::text as name', ['brianc'])
    await pool.end()
    const res: any = await query
    expect(res.rows[0].name).toBe('brianc')
  })

  it('pool.end() - finish pending queries', async () => {
    const pool = new Pool({ max: 20 })
    let completed = 0
    for (let x = 1; x <= 20; x++) {
      pool.query('SELECT $1::text as name', ['brianc']).then(() => completed++)
    }
    await pool.end()
    expect(completed).toBe(20)
  })
})
