import { Pool } from 'pg'
import { describe, it } from 'vitest'
import QueryStream from '../src/index.ts'

describe('pool', () => {
  it('works', async () => {
    const pool = new Pool()
    const query = new QueryStream('SELECT * FROM generate_series(0, 10) num', [])
    const q = pool.query(query)
    query.on('data', () => {
      // just consume the whole stream
    })
    await q
    query.on('end', () => {
      pool.end()
    })
  })
})
