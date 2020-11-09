'use strict'

const fs = require('fs')

const helper = require('./test-helper')
const pg = helper.pg

const suite = new helper.Suite()

if (process.env.PG_CLIENT_CERT_TEST) {
  suite.testAsync('client certificate', async () => {
    const pool = new pg.Pool({
      ssl: {
        ca: fs.readFileSync(process.env.PGSSLROOTCERT),
        cert: fs.readFileSync(process.env.PGSSLCERT),
        key: fs.readFileSync(process.env.PGSSLKEY),
      },
    })

    await pool.query('SELECT 1')
    await pool.end()
  })
}
