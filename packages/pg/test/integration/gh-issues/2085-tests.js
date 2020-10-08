'use strict'
var helper = require('./../test-helper')
var assert = require('assert')

const suite = new helper.Suite()

// allow skipping of this test via env var for
// local testing when you don't have SSL set up
if (process.env.PGTESTNOSSL) {
  return
}

suite.testAsync('it should connect over ssl', async () => {
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

suite.testAsync('it should fail with self-signed cert error w/o rejectUnauthorized being passed', async () => {
  const ssl = helper.args.native ? 'verify-ca' : {}
  const client = new helper.pg.Client({ ssl })
  try {
    await client.connect()
  } catch (e) {
    return
  }
  throw new Error('this test should have thrown an error due to self-signed cert')
})
