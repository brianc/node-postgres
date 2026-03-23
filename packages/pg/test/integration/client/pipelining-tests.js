'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()

suite.test('basic pipelining with simple queries', async function () {
  const client = helper.client()
  client.pipelining = true

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

suite.test('pipelining with parameterized queries', async function () {
  const client = helper.client()
  client.pipelining = true

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

suite.test('pipelining with named prepared statements', async function () {
  const client = helper.client()
  client.pipelining = true

  const [r1, r2] = await Promise.all([
    client.query({ name: 'fetch-num', text: 'SELECT $1::int AS num', values: [42] }),
    client.query({ name: 'fetch-num', text: 'SELECT $1::int AS num', values: [99] }),
  ])

  assert.equal(r1.rows[0].num, 42)
  assert.equal(r2.rows[0].num, 99)

  await client.end()
})

suite.test('pipelining error isolation', async function () {
  const client = helper.client()
  client.pipelining = true

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

suite.test('pipelining drain event', async function () {
  const client = helper.client()
  client.pipelining = true

  const drainPromise = new Promise((resolve) => {
    client.on('drain', resolve)
  })

  client.query('SELECT 1')
  client.query('SELECT 2')
  client.query('SELECT 3')

  await drainPromise
  await client.end()
})
