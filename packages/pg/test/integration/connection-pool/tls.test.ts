import * as fs from 'node:fs'
import { describe, it } from 'vitest'
import helper from './_test-helper.ts'

describe('tls', () => {
  const pg = helper.pg
  if (process.env.PG_CLIENT_CERT_TEST) {
    it('client certificate', async () => {
      const pool = new pg.Pool({
        ssl: {
          ca: fs.readFileSync(process.env.PGSSLROOTCERT!),
          cert: fs.readFileSync(process.env.PGSSLCERT!),
          key: fs.readFileSync(process.env.PGSSLKEY!),
        },
      })

      await pool.query('SELECT 1')
      await pool.end()
    })
  } else {
    it.skip('client certificate (requires PG_CLIENT_CERT_TEST)', () => {})
  }
})
