import { Pool } from 'pg'
import sasl from 'pg/lib/crypto/sasl'
import { test } from 'vitest'
import assert from 'assert'

test('default', async () => {
  const pool = new Pool()
  const result = await pool.query('SELECT $1::text as name', ['cloudflare'])
  assert(result.rows[0].name === 'cloudflare')
  pool.end()
})

// Regression guard: confirms `@mongodb-js/saslprep` (a transitive dep added to
// fix RFC 4013 compliance for SCRAM-SHA-256) resolves and runs under workerd.
// If the dep ever ships a Node-only API or breaks worker compatibility, this
// fails with a module-loading or runtime error instead of silently falling back
// to non-prepped passwords.
test('SASLprep is engaged on the SCRAM path under workerd', async () => {
  const session = { message: 'SASLInitialResponse', clientNonce: 'a' }
  const sessionRef = { message: 'SASLInitialResponse', clientNonce: 'a' }
  // 'I\u00ADX' (with soft hyphen, B.1 mapped-to-nothing) must SASLprep to 'IX'
  await sasl.continueSession(session, 'I\u00ADX', 'r=ab,s=abcd,i=1')
  await sasl.continueSession(sessionRef, 'IX', 'r=ab,s=abcd,i=1')
  assert.strictEqual(session.serverSignature, sessionRef.serverSignature)
  assert.strictEqual(session.response, sessionRef.response)
})
