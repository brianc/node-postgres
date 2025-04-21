import { Pool } from 'pg'
import { test } from 'vitest'
import assert from 'node:assert'

test('default', async () => {
  const pool = new Pool()

  const result = await pool.query('SELECT $1::text as name', ['cloudflare'])
  assert(result.rows[0].name === 'cloudflare')
  pool.end()
})
