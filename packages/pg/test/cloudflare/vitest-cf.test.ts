import { Pool } from 'pg'
import { test } from 'vitest'
import assert from 'node:assert'

test('default', async () => {
  const pool = new Pool({
    connectionString: 'postgres://postgres:password@localhost:5432/postgres',
  })

  const result = await pool.query('SELECT $1::text as name', ['cloudflare'])
  assert(result.rows[0].name === 'cloudflare')
  pool.end()
})
