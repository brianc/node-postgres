'use strict'

const fs = require('fs')

const helper = require('./test-helper')
const pg = helper.pg

const suite = new helper.Suite()

if (process.env.PG_CLIENT_CERT_TEST) {
  suite.testAsync('client certificate', async () => {
    // PGSSLROOTCERT, PGSSLCERT, and PGSSLKEY are all set as environment
    // variables in .travis.yml
    const pool = new pg.Pool()

    await pool.query('SELECT 1')
    await pool.end()
  })
}
