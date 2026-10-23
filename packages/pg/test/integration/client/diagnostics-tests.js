'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const dc = require('diagnostics_channel')

// See unit/client/diagnostics-tests.js for why Node < 19.9 is skipped.
const hasStableTracingChannel =
  typeof dc.tracingChannel === 'function' && typeof dc.tracingChannel('pg:test:probe').hasSubscribers === 'boolean'

const suite = new helper.Suite()
// the native client does not publish to the tracing channels
const test = (name, cb) => suite.test(name, hasStableTracingChannel && !helper.args.native ? cb : undefined)

const collectQueries = () => {
  const finished = []
  const errors = []
  const subs = {
    start: () => {},
    end: () => {},
    asyncStart: () => {},
    asyncEnd: (ctx) => finished.push(ctx),
    error: (ctx) => errors.push(ctx),
  }
  const channel = dc.tracingChannel('pg:query')
  channel.subscribe(subs)
  return { finished, errors, unsubscribe: () => channel.unsubscribe(subs) }
}

test('traces queries against a real server', async function () {
  const traced = collectQueries()
  const client = new helper.Client()
  try {
    await client.connect()
    await client.query('SELECT $1::int AS num', [1])
    await assert.rejects(client.query('SELECT * FROM table_that_does_not_exist'))
  } finally {
    await client.end()
    traced.unsubscribe()
  }

  const ok = traced.finished.find((ctx) => ctx.query.text === 'SELECT $1::int AS num')
  assert.equal(ok.result.command, 'SELECT')
  assert.equal(ok.result.rowCount, 1)
  assert.deepEqual(ok.result.rows, [{ num: 1 }])
  assert.equal(ok.client.database, client.database)

  assert.equal(traced.errors.length, 1)
  assert.equal(traced.errors[0].query.text, 'SELECT * FROM table_that_does_not_exist')
  assert.equal(traced.errors[0].error.code, '42P01')
})

test('traces each query in pipeline mode', async function () {
  const traced = collectQueries()
  const client = helper.client(undefined, { pipeline: true })
  try {
    await Promise.all([
      client.query('SELECT 1 AS num'),
      client.query('SELECT 2 AS num'),
      client.query('SELECT 3 AS num'),
    ])
  } finally {
    await client.end()
    traced.unsubscribe()
  }

  const texts = traced.finished.filter((ctx) => /^SELECT \d AS num$/.test(ctx.query.text)).map((ctx) => ctx.query.text)
  assert.deepEqual(texts, ['SELECT 1 AS num', 'SELECT 2 AS num', 'SELECT 3 AS num'])
})
