import { Pool } from 'pg'
import { test } from 'vitest'
import assert from 'assert'
import args from '../cli'

test('default', async () => {
  const pool = new Pool(args)
  const result = await pool.query('SELECT $1::text as name', ['cloudflare'])
  assert(result.rows[0].name === 'cloudflare')
  pool.end()
})
