'use strict'

// pg against itself: the same statements, on one connection per mode, and every mode must
// answer what a plain query on a plain client answered.
//
// The reference arm is `client.query(text, values)`. The others are the paths a program can
// take to the same rows: the extended protocol forced on a query that would have used the
// simple one, a named prepared statement run twice, rowMode array, the binary result format,
// pipeline mode with the whole round in flight at once, pg-cursor reading in batches and
// pg-query-stream. Each keeps its own connection and runs the whole round in order, so the
// temp table and the transaction state are the same on every arm.
//
//   node fuzz/modes.js                 fifty rounds, PG* variables say where the server is
//   node fuzz/modes.js --seed 12345    replay what a past run did
//   node fuzz/modes.js --keep-going    do not stop at the first divergence

const { createHash } = require('crypto')
const pg = require('../packages/pg')
const Cursor = require('../packages/pg-cursor')
const QueryStream = require('../packages/pg-query-stream')
const { int, mulberry32, main } = require('./lib')
const { draw, render, summarize, QUIET, rowsOnly, source, variants, SETUP } = require('./queries')

// the outcome of a query, whichever way it went
const outcome = (promise) =>
  promise.then(
    (result) => ({ result }),
    (error) => ({ error })
  )
const settle = (promise) => outcome(promise).then(({ result, error }) => summarize(result, error))
const settleRows = (promise) => outcome(promise).then(({ result, error }) => rowsOnly(result, error))

const name = (text) => `fuzz_${createHash('sha1').update(text).digest('hex')}`

// each arm runs one query of the round on its own connection and answers the canonical text.
// `rng` is the round's, so a batch size is drawn the same on a replay
const ARMS = {
  extended: (client, q) => settle(client.query({ text: q.text, values: q.values, queryMode: 'extended' })),
  // twice, so the second run goes through the statement cache; only a select, since running a
  // write twice would leave this arm's table different from the others
  prepared: async (client, q) => {
    const first = await settle(client.query({ text: q.text, values: q.values, name: name(q.text) }))
    // and not after a failure either, which would have aborted an open transaction
    if (q.kind !== 'select' || first.startsWith('{"error"')) return first
    const second = await settle(client.query({ text: q.text, values: q.values, name: name(q.text) }))
    return first === second ? first : `first run: ${first}\n  second run: ${second}`
  },
  array: async (client, q, rng, reference) => {
    const got = await settle(client.query({ text: q.text, values: q.values, rowMode: 'array' }))
    // the reference rows as arrays, which is the only thing this mode changes
    const { result, error } = reference
    const expected = summarize(result && { ...result, rows: result.rows.map(Object.values) }, error)
    return got === expected ? summarize(result, error) : got
  },
  binary: (client, q) =>
    q.binary
      ? settle(client.query({ text: q.text, values: q.values, binary: true }))
      : settle(client.query(q.text, q.values)),
  cursor: async (client, q, rng) => {
    if (q.kind !== 'select') return settleRows(client.query(q.text, q.values))
    const cursor = client.query(new Cursor(q.text, q.values))
    const rows = []
    try {
      for (;;) {
        const batch = await cursor.read(int(rng, 1, 40))
        if (batch.length === 0) break
        rows.push(...batch)
      }
      await cursor.close()
      return rowsOnly({ rows })
    } catch (error) {
      return rowsOnly(null, error)
    }
  },
  stream: async (client, q, rng) => {
    if (q.kind !== 'select') return settleRows(client.query(q.text, q.values))
    const rows = []
    try {
      const stream = client.query(
        new QueryStream(q.text, q.values, { batchSize: int(rng, 1, 40), highWaterMark: int(rng, 1, 40) })
      )
      for await (const row of stream) rows.push(row)
      return rowsOnly({ rows })
    } catch (error) {
      return rowsOnly(null, error)
    }
  },
}

const clients = {}
const connect = async () => {
  clients.reference = new pg.Client()
  clients.pipeline = new pg.Client({ pipeline: true })
  for (const arm of Object.keys(ARMS)) clients[arm] = new pg.Client()
  for (const client of Object.values(clients)) {
    await client.connect()
    await client.query(QUIET)
  }
}

// every round starts from the same state on every arm: no transaction open, an empty table
const reset = async (client) => {
  await client.query('ROLLBACK').catch(() => {})
  await client.query('DROP TABLE IF EXISTS fuzz_rows')
  await client.query(SETUP)
}

const run = async (plan) => {
  if (!clients.reference) await connect()
  for (const client of Object.values(clients)) await reset(client)
  const rng = mulberry32(plan.queries.length)
  const queries = plan.queries.map(render)
  const references = []
  for (const q of queries) references.push(await outcome(clients.reference.query(q.text, q.values)))
  const full = references.map(({ result, error }) => summarize(result, error))

  // the whole round in flight at once on the pipelined connection
  const pipelined = await Promise.all(queries.map((q) => settle(clients.pipeline.query(q.text, q.values))))
  for (let i = 0; i < queries.length; i++) {
    if (pipelined[i] !== full[i])
      return `pipeline, query ${i}
  reference: ${full[i]}
  pipeline:  ${pipelined[i]}`
  }

  for (const [arm, runArm] of Object.entries(ARMS)) {
    for (let i = 0; i < queries.length; i++) {
      const got = await runArm(clients[arm], queries[i], rng, references[i])
      const { result, error } = references[i]
      const expected = arm === 'cursor' || arm === 'stream' ? rowsOnly(result, error) : full[i]
      if (got !== expected)
        return `${arm}, query ${i}
  reference: ${expected}
  ${arm}: ${got}`
    }
  }
  return null
}

const close = async () => {
  for (const client of Object.values(clients)) await client.end()
}

main({ name: 'modes', draw, run, variants, source, close })
