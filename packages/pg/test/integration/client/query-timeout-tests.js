'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()

const Pool = helper.pg.Pool

// A query that times out while it is the active query leaves the connection
// half open: the server never sends ReadyForQuery, so readyForQuery stays false
// and every later query on that client sits in the queue forever. Releasing it
// back to a pool then hands a dead connection to the next caller.
suite.test('query_timeout does not leave a pooled client unusable', async () => {
  const pool = new Pool(Object.assign({}, helper.config, { query_timeout: 500, max: 1 }))

  const client = await pool.connect()
  await assert.rejects(() => client.query('SELECT pg_sleep(5)'), /timeout/i)
  client.release()

  // Without the fix this never settles, so bound it rather than hanging the suite.
  const result = await Promise.race([
    pool.query('SELECT 1 AS ok'),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('pool never recovered after a query_timeout')), 1500).unref()
    ),
  ])

  assert.strictEqual(result.rows[0].ok, 1)
  await pool.end()
})

// The same client, used directly, must also not accept work it can never run.
suite.test('query_timeout marks the client unusable rather than queueing forever', async () => {
  const client = new helper.pg.Client(Object.assign({}, helper.config, { query_timeout: 500 }))
  await client.connect()

  await assert.rejects(() => client.query('SELECT pg_sleep(5)'), /timeout/i)

  await assert.rejects(
    () =>
      Promise.race([
        client.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('query queued forever on a timed out client')), 1500).unref()
        ),
      ]),
    (err) => !/queued forever/.test(err.message)
  )

  await client.end().catch(() => {})
})
