'use strict'
const helper = require('./../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

// allow skipping of this test via env var for
// local testing when you don't have SSL set up
if (process.env.PGTESTNOSSL) {
  return
}

// The native client leaves SSL to libpq, which uses the system OpenSSL. Node 16 and
// earlier statically link OpenSSL 1.1.1 and export its symbols, which take precedence
// over the OpenSSL 3 that a current libpq is built against: libpq's calls to SSL_new and
// SSL_connect land in 1.1.1, while its call to SSL_get1_peer_certificate, a name 1.1.1
// does not define, lands in OpenSSL 3 and reads a structure it does not recognize. So the
// handshake completes but no peer certificate can be retrieved, and libpq reports
// "certificate could not be obtained: no SSL error reported". Node 18 is the first release
// to bundle OpenSSL 3, and nothing on this side of the boundary can make an earlier one work.
if (helper.args.native && parseInt(process.versions.openssl, 10) < 3) {
  return
}

suite.test('it should connect over ssl', async () => {
  const ssl = helper.args.native
    ? 'require'
    : {
        rejectUnauthorized: false,
      }
  const client = new helper.pg.Client({ ssl })
  await client.connect()
  const { rows } = await client.query('SELECT NOW()')
  assert.strictEqual(rows.length, 1)
  await client.end()
})

suite.test('it should fail with self-signed cert error w/o rejectUnauthorized being passed', async () => {
  const ssl = helper.args.native ? 'verify-ca' : {}
  const client = new helper.pg.Client({ ssl })
  try {
    await client.connect()
  } catch (e) {
    return
  }
  throw new Error('this test should have thrown an error due to self-signed cert')
})
