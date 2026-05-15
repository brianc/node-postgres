'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()

suite.test('basic pipeline with simple queries', async function () {
  const client = helper.client(undefined, { pipeline: true })

  const [r1, r2, r3] = await Promise.all([
    client.query('SELECT 1 AS num'),
    client.query('SELECT 2 AS num'),
    client.query('SELECT 3 AS num'),
  ])

  assert.equal(r1.rows[0].num, 1)
  assert.equal(r2.rows[0].num, 2)
  assert.equal(r3.rows[0].num, 3)

  await client.end()
})

suite.test('pipeline with parameterized queries', async function () {
  const client = helper.client(undefined, { pipeline: true })

  const [r1, r2, r3] = await Promise.all([
    client.query('SELECT $1::int AS num', [10]),
    client.query('SELECT $1::text AS name', ['hello']),
    client.query('SELECT $1::int + $2::int AS sum', [3, 4]),
  ])

  assert.equal(r1.rows[0].num, 10)
  assert.equal(r2.rows[0].name, 'hello')
  assert.equal(r3.rows[0].sum, 7)

  await client.end()
})

suite.test('pipeline with named prepared statements', async function () {
  const client = helper.client(undefined, { pipeline: true })

  const [r1, r2] = await Promise.all([
    client.query({ name: 'fetch-num', text: 'SELECT $1::int AS num', values: [42] }),
    client.query({ name: 'fetch-num', text: 'SELECT $1::int AS num', values: [99] }),
  ])

  assert.equal(r1.rows[0].num, 42)
  assert.equal(r2.rows[0].num, 99)

  await client.end()
})

suite.test('pipeline error isolation', async function () {
  const client = helper.client(undefined, { pipeline: true })

  const results = await Promise.allSettled([
    client.query('SELECT 1 AS num'),
    client.query('SELECT INVALID SYNTAX'),
    client.query('SELECT 3 AS num'),
  ])

  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[0].value.rows[0].num, 1)
  assert.equal(results[1].status, 'rejected')
  assert.equal(results[2].status, 'fulfilled')
  assert.equal(results[2].value.rows[0].num, 3)

  await client.end()
})

suite.test('pipeline drain event', async function () {
  const client = helper.client(undefined, { pipeline: true })

  const drainPromise = new Promise((resolve) => {
    client.on('drain', resolve)
  })

  client.query('SELECT 1')
  client.query('SELECT 2')
  client.query('SELECT 3')

  await drainPromise
  await client.end()
})

// #12: end() during active pipeline — should drain gracefully, not destroy
suite.test('end() waits for in-flight pipelined queries to complete', async function () {
  const client = helper.client(undefined, { pipeline: true })

  // Fire queries then call end() immediately without awaiting them
  const p1 = client.query('SELECT 1 AS num')
  const p2 = client.query('SELECT 2 AS num')
  const endPromise = client.end()

  // All queries should resolve (not error) because end() drains gracefully
  const [r1, r2] = await Promise.all([p1, p2])
  assert.equal(r1.rows[0].num, 1)
  assert.equal(r2.rows[0].num, 2)
  await endPromise
})

// #13: named statement error cleanup — submittedNamedStatements not left stale
// This relies on submittedNamedStatements tracking which only exists in the JS client
suite.test(
  'named statement parse error cleans up and allows re-preparation',
  !helper.args.native &&
    async function () {
      const client = helper.client(undefined, { pipeline: true })

      // Use an invalid type to force a server-side parse error
      const err = await client
        .query({ name: 'bad-stmt', text: 'SELECT $1::nonexistent_type_xyz', values: [1] })
        .then(() => null)
        .catch((e) => e)

      assert.ok(err, 'expected parse to fail')

      // The stale submittedNamedStatements entry should be gone.
      // Re-using the same name with valid SQL should work.
      const result = await client.query({ name: 'bad-stmt', text: 'SELECT $1::int AS n', values: [42] })
      assert.equal(result.rows[0].n, 42)

      await client.end()
    }
)

// #14: query_timeout with pipelining
// When an already-sent pipelined query times out, the connection is destroyed
// to unblock the pipeline — subsequent queries error rather than hanging.
// Native client does not support query_timeout in pipeline mode.
suite.test(
  'query_timeout on sent pipelined query destroys connection to unblock',
  !helper.args.native &&
    async function () {
      const client = helper.client(undefined, { pipeline: true })
      client.on('error', () => {}) // absorb the 'error' event emitted when stream is destroyed

      const results = await Promise.allSettled([
        client.query('SELECT 1 AS num'),
        client.query({ text: 'SELECT pg_sleep(30)', query_timeout: 100 }),
        client.query('SELECT 3 AS num'),
      ])

      // Query 1 completes before the slow query enters the pipeline
      assert.equal(results[0].status, 'fulfilled')
      assert.equal(results[0].value.rows[0].num, 1)

      // Query 2 times out
      assert.equal(results[1].status, 'rejected')
      assert.ok(results[1].reason.message.includes('timeout'), `unexpected error: ${results[1].reason.message}`)

      // Query 3 errors because the connection was destroyed to unblock the pipeline
      assert.equal(results[2].status, 'rejected')
    }
)
