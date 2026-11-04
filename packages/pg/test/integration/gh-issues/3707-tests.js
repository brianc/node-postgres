'use strict'
const helper = require('../test-helper')
const assert = require('assert')

// An ErrorResponse during a `rows`-limited (portal suspension) query used to
// permanently wedge the connection: `_getRows` pipelines Flush rather than
// Sync between page requests, and `handleError` never sent a Sync to make up
// for it. Per the extended query protocol, the backend discards all
// subsequent messages until it receives a Sync, so every later query on the
// same connection would queue forever.
// https://github.com/brianc/node-postgres/issues/3707
const suite = new helper.Suite()

suite.test('recovers after an error during a rows-limited query', async () => {
  const client = new helper.Client()
  await client.connect()

  let caught = null
  try {
    // division by zero fails partway through the result set, after at
    // least one page (rows: 2) has already been returned by the portal.
    await client.query({
      text: 'SELECT 1 / (x - 5) AS v FROM generate_series(1, 10) AS x',
      rows: 2,
    })
  } catch (err) {
    caught = err
  }

  assert(caught, 'expected the query to reject with a division-by-zero error')
  assert.equal(caught.code, '22012') // division_by_zero

  // Before the fix this would hang until the test's 5s timeout fired,
  // because the connection never received ReadyForQuery.
  const res = await client.query('SELECT 1 AS ok')
  assert.equal(res.rows[0].ok, 1)

  await client.end()
})

suite.test('does not double-sync when a row fails to parse after an error-free portal suspension', async () => {
  const client = new helper.Client()
  await client.connect()

  // A parse failure in handleDataRow sets _canceledDueToError and is
  // replayed from handleReadyForQuery, i.e. after ReadyForQuery has already
  // been received for this query. handleError must not sync a second time
  // on that path, or it would desync the client from the server's reply
  // stream for the next query.
  const throwingTypes = {
    getTypeParser: () => () => {
      throw new Error('forced row parse failure')
    },
  }

  let caught = null
  try {
    await client.query({
      text: 'SELECT x FROM generate_series(1, 10) AS x',
      rows: 2,
      types: throwingTypes,
    })
  } catch (err) {
    caught = err
  }

  assert(caught, 'expected the query to reject with the forced parse error')
  assert.equal(caught.message, 'forced row parse failure')

  const res = await client.query('SELECT 1 AS ok')
  assert.equal(res.rows[0].ok, 1)

  await client.end()
})
