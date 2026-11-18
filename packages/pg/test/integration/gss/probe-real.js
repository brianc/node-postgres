'use strict'

const assert = require('assert')
const fs = require('fs')
const { Client, Pool } = require(process.env.PG_GSS_CLIENT_ROOT + '/lib')
const scenario = process.argv[2]
const options = {
  host: 'localhost',
  port: 55439,
  user: scenario === 'rejected-identity' ? 'rejectedrole' : 'pgrepro',
  database: 'gssrepro',
  connectionTimeoutMillis: 3000,
  gssencmode: scenario === 'required-encryption' ? 'require' : 'disable',
  krbsrvname: scenario === 'invalid-service' ? 'missing-service' : 'postgres',
  ssl: scenario === 'plain' ? false : { ca: fs.readFileSync('/work/fixture/ca.crt', 'utf8'), rejectUnauthorized: true },
}
if (scenario === 'invalid-ca') options.ssl.ca = ''
if (scenario === 'ssh' || scenario === 'ssh-without-database-host') {
  options.host = '127.0.0.1'
  options.port = 55440
  if (scenario === 'ssh') options.gssHost = 'localhost'
}

async function verify(client) {
  const result = await client.query(
    'SELECT 42 AS answer, ' +
      '(SELECT gss_authenticated FROM pg_catalog.pg_stat_gssapi WHERE pid=pg_backend_pid()) AS gss_auth, ' +
      '(SELECT encrypted FROM pg_catalog.pg_stat_gssapi WHERE pid=pg_backend_pid()) AS gss_encrypted, ' +
      '(SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls'
  )
  assert.strictEqual(result.rows[0].answer, 42)
  assert.strictEqual(result.rows[0].gss_auth, true)
  assert.strictEqual(result.rows[0].gss_encrypted, false)
  assert.strictEqual(result.rows[0].tls, scenario !== 'plain')
  if (scenario !== 'plain') assert.strictEqual(client.connection.stream.authorized, true)
  return result.rows[0]
}

async function main() {
  if (scenario === 'missing-ticket') process.env.KRB5CCNAME = 'FILE:/work/fixture/missing.ccache'
  if (scenario === 'expired-ticket') process.env.KRB5CCNAME = 'FILE:/work/fixture/expired.ccache'
  let client
  let pool
  try {
    let data
    if (scenario === 'pool') {
      pool = new Pool({ ...options, max: 1 })
      for (let attempt = 0; attempt < 3; attempt++) {
        client = await pool.connect()
        try {
          data = await verify(client)
        } finally {
          client.release()
          client = null
        }
      }
    } else {
      client = new Client(options)
      await client.connect()
      data = await verify(client)
    }
    console.log(JSON.stringify({ scenario, status: 'connected', data, node: process.version }))
  } catch (error) {
    console.log(JSON.stringify({ scenario, status: 'rejected', code: error.code || null, node: process.version }))
  } finally {
    if (client) await client.end()
    if (pool) await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 70
})
