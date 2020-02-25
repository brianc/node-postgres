'use strict'
const { pg, Suite } = require('./test-helper')
const assert = require('assert')

const suite = new Suite()

suite.testAsync('it can connect w/ ssl', async () => {
  const ssl = {
    rejectUnauthorized: false,
  }

  const client = new pg.Client({ ssl })
  await client.connect()
  assert.strictEqual(client.connection.stream.encrypted, true)
  await client.end()
})

suite.testAsync('it rejects on self-signed cert', async () => {
  const ssl = true
  const client = new pg.Client({ ssl })
  try {
    await client.connect()
  } catch (e) {
    assert(e.message.includes('self signed'))
    return
  }
  throw new Error('connection should have failed with self-signed cert error')
})
