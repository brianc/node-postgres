'use strict'
const pg = require('./lib')

let Native
try {
  Native = require('pg-native')
} catch (e) {
  // pg-native not available — skip native benchmarks
}

const SECONDS = 5
const BATCH = 10

async function bench(label, fn, seconds) {
  // warmup
  for (let i = 0; i < 100; i++) await fn()

  const deadline = Date.now() + seconds * 1000
  let count = 0
  while (Date.now() < deadline) {
    await fn()
    count++
  }
  const qps = (count / seconds).toFixed(0)
  console.log(`  ${label}: ${qps} qps (${count} queries in ${seconds}s)`)
  return count / seconds
}

// --- JS client helpers ---

async function jsSerial(label, query, seconds) {
  const client = new pg.Client()
  await client.connect()
  const qps = await bench(label, () => client.query(query), seconds)
  await client.end()
  return qps
}

async function jsPipelined(label, makeQueries, batchSize, seconds) {
  const client = new pg.Client()
  await client.connect()
  client.pipelining = true

  // warmup
  for (let i = 0; i < 10; i++) {
    await Promise.all(makeQueries(batchSize).map((q) => client.query(q)))
  }

  const deadline = Date.now() + seconds * 1000
  let count = 0
  while (Date.now() < deadline) {
    await Promise.all(makeQueries(batchSize).map((q) => client.query(q)))
    count += batchSize
  }
  const qps = (count / seconds).toFixed(0)
  console.log(`  ${label} (batch=${batchSize}): ${qps} qps`)
  await client.end()
  return count / seconds
}

// --- Native client helpers ---

function nativeConnect() {
  return new Promise((resolve, reject) => {
    const client = new Native()
    client.connect((err) => {
      if (err) return reject(err)
      resolve(client)
    })
  })
}

function nativeQuery(client, text, values) {
  return new Promise((resolve, reject) => {
    client.query(text, values, (err, rows) => {
      if (err) return reject(err)
      resolve(rows)
    })
  })
}

function nativeEnd(client) {
  return new Promise((resolve) => {
    client.end(() => resolve())
  })
}

function nativePipeline(client, queries) {
  return new Promise((resolve, reject) => {
    client.pipeline(queries, (err, results) => {
      if (err) return reject(err)
      resolve(results)
    })
  })
}

async function nativeSerial(label, text, values, seconds) {
  const client = await nativeConnect()

  // warmup
  for (let i = 0; i < 100; i++) await nativeQuery(client, text, values)

  const deadline = Date.now() + seconds * 1000
  let count = 0
  while (Date.now() < deadline) {
    await nativeQuery(client, text, values)
    count++
  }
  const qps = (count / seconds).toFixed(0)
  console.log(`  ${label}: ${qps} qps (${count} queries in ${seconds}s)`)
  await nativeEnd(client)
  return count / seconds
}

async function nativePipelined(label, makeQueries, batchSize, seconds) {
  const client = await nativeConnect()

  // warmup
  for (let i = 0; i < 10; i++) {
    await nativePipeline(client, makeQueries(batchSize))
  }

  const deadline = Date.now() + seconds * 1000
  let count = 0
  while (Date.now() < deadline) {
    await nativePipeline(client, makeQueries(batchSize))
    count += batchSize
  }
  const qps = (count / seconds).toFixed(0)
  console.log(`  ${label} (batch=${batchSize}): ${qps} qps`)
  await nativeEnd(client)
  return count / seconds
}

// --- Main ---

async function run() {
  const results = {}

  console.log('\n=== JS Client — Serial ===')
  results.jsSerialSimple = await jsSerial('simple SELECT 1', { text: 'SELECT 1' }, SECONDS)
  results.jsSerialParam = await jsSerial('parameterized', { text: 'SELECT $1::int AS n', values: [42] }, SECONDS)
  results.jsSerialNamed = await jsSerial(
    'named prepared',
    { name: 'bench-named', text: 'SELECT $1::int AS n', values: [42] },
    SECONDS
  )

  console.log('\n=== JS Client — Pipelined ===')
  results.jsPipedSimple = await jsPipelined(
    'simple SELECT 1',
    (n) => Array.from({ length: n }, () => ({ text: 'SELECT 1' })),
    BATCH,
    SECONDS
  )
  results.jsPipedParam = await jsPipelined(
    'parameterized',
    (n) => Array.from({ length: n }, () => ({ text: 'SELECT $1::int AS n', values: [42] })),
    BATCH,
    SECONDS
  )
  results.jsPipedNamed = await jsPipelined(
    'named prepared',
    (n) =>
      Array.from({ length: n }, (_, i) => ({ name: `bench-named-${i}`, text: 'SELECT $1::int AS n', values: [42] })),
    BATCH,
    SECONDS
  )

  if (Native) {
    console.log('\n=== Native Client — Serial ===')
    results.nativeSerialSimple = await nativeSerial('simple SELECT 1', 'SELECT 1', undefined, SECONDS)
    results.nativeSerialParam = await nativeSerial('parameterized', 'SELECT $1::int AS n', [42], SECONDS)

    console.log('\n=== Native Client — Pipelined ===')
    results.nativePipedSimple = await nativePipelined(
      'simple SELECT 1',
      (n) => Array.from({ length: n }, () => ({ text: 'SELECT 1' })),
      BATCH,
      SECONDS
    )
    results.nativePipedParam = await nativePipelined(
      'parameterized',
      (n) => Array.from({ length: n }, () => ({ text: 'SELECT $1::int AS n', values: [42] })),
      BATCH,
      SECONDS
    )
  } else {
    console.log('\n(pg-native not available — skipping native benchmarks)')
  }

  // --- Summary ---
  console.log('\n=== Speedup Summary ===')
  console.log('JS pipelining vs serial:')
  console.log(`  simple:        ${(results.jsPipedSimple / results.jsSerialSimple).toFixed(2)}x`)
  console.log(`  parameterized: ${(results.jsPipedParam / results.jsSerialParam).toFixed(2)}x`)
  console.log(`  named:         ${(results.jsPipedNamed / results.jsSerialNamed).toFixed(2)}x`)

  if (Native) {
    console.log('Native pipelining vs serial:')
    console.log(`  simple:        ${(results.nativePipedSimple / results.nativeSerialSimple).toFixed(2)}x`)
    console.log(`  parameterized: ${(results.nativePipedParam / results.nativeSerialParam).toFixed(2)}x`)

    console.log('Native serial vs JS serial:')
    console.log(`  simple:        ${(results.nativeSerialSimple / results.jsSerialSimple).toFixed(2)}x`)
    console.log(`  parameterized: ${(results.nativeSerialParam / results.jsSerialParam).toFixed(2)}x`)

    console.log('Native pipelined vs JS pipelined:')
    console.log(`  simple:        ${(results.nativePipedSimple / results.jsPipedSimple).toFixed(2)}x`)
    console.log(`  parameterized: ${(results.nativePipedParam / results.jsPipedParam).toFixed(2)}x`)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
