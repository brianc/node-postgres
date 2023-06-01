'use strict'

const fs = require('fs')

const helper = require('./test-helper')
const pg = helper.pg

const suite = new helper.Suite()

if (process.env.PG_CLIENT_CERT_TEST) {

  // Test SSL using "options object" constructor
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

  // Test SSL by only defining environment variables without any explicit reference to the cert files in the code
  // to be compliant with lib-pg: https://www.postgresql.org/docs/current/libpq-envars.html
  suite.testAsync('client certificate', async () => {
    const pool = new pg.Pool({})

    await pool.query('SELECT 1')
    await pool.end()
  })
}
