'use strict'

// pg against pg-native: the same statements on the pure javascript client and on the libpq one,
// which promise the same API, and every result and every error compared.
//
// Three arms on each side: a plain query, a named prepared statement and rowMode array. Each
// keeps its own connection and runs the whole round in order, so the temp table and the
// transaction state are the same everywhere. Needs pg-native built, which is what the CI has.
//
//   node fuzz/native.js                fifty rounds, PG* variables say where the server is
//   node fuzz/native.js --seed 12345   replay what a past run did
//   node fuzz/native.js --keep-going   do not stop at the first divergence

const { createHash } = require('crypto')
const pg = require('../packages/pg')
const { main } = require('./lib')
const { draw, render, summarize, QUIET, source, variants, SETUP } = require('./queries')

if (!pg.native) {
  console.error('pg-native is not available, install libpq and rebuild')
  process.exit(1)
}

const settle = (promise) =>
  promise.then(
    (result) => summarize(result),
    (error) => summarize(null, error)
  )

const name = (text) => `fuzz_${createHash('sha1').update(text).digest('hex')}`

// how one query is run on a client, for each of the three ways the two clients share
const ARMS = {
  query: (client, q) => settle(client.query(q.text, q.values)),
  prepared: (client, q) => settle(client.query({ text: q.text, values: q.values, name: name(q.text) })),
  array: (client, q) => settle(client.query({ text: q.text, values: q.values, rowMode: 'array' })),
}

const clients = {}
const connect = async () => {
  for (const arm of Object.keys(ARMS)) {
    clients[arm] = { js: new pg.Client(), native: new pg.native.Client() }
    await clients[arm].js.connect()
    await clients[arm].native.connect()
    await clients[arm].js.query(QUIET)
    await clients[arm].native.query(QUIET)
  }
}

// every round starts from the same state on every connection: no transaction open, an empty table
const reset = async (client) => {
  await client.query('ROLLBACK').catch(() => {})
  await client.query('DROP TABLE IF EXISTS fuzz_rows')
  await client.query(SETUP)
}

const run = async (plan) => {
  if (!clients.query) await connect()
  const queries = plan.queries.map(render)
  for (const [arm, runArm] of Object.entries(ARMS)) {
    const { js, native } = clients[arm]
    await reset(js)
    await reset(native)
    for (let i = 0; i < queries.length; i++) {
      const expected = await runArm(js, queries[i])
      const got = await runArm(native, queries[i])
      if (got !== expected) return `${arm}, query ${i}\n  pg:        ${expected}\n  pg-native: ${got}`
    }
  }
  return null
}

const close = async () => {
  for (const { js, native } of Object.values(clients)) {
    await js.end()
    await native.end()
  }
}

main({ name: 'native', draw: (rng) => draw(rng, { buffers: false }), run, variants, source, close })
