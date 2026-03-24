'use strict'
const pg = require('./lib')

// Queries to benchmark
const SIMPLE = { text: 'SELECT 1' }
const PARAM = {
  text: 'SELECT $1::int AS n',
  values: [42],
}
const NAMED = {
  name: 'bench-named',
  text: 'SELECT $1::int AS n',
  values: [42],
}

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

async function benchPipelined(label, makeQueries, batchSize, seconds) {
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
    const queries = makeQueries(batchSize)
    await Promise.all(queries.map((q) => client.query(q)))
    count += batchSize
  }
  const qps = (count / seconds).toFixed(0)
  console.log(`  ${label} (batch=${batchSize}): ${qps} qps`)

  await client.end()
  return count / seconds
}

async function runSerial(label, query, seconds) {
  const client = new pg.Client()
  await client.connect()

  const qps = await bench(label, () => client.query(query), seconds)
  await client.end()
  return qps
}

async function run() {
  const SECONDS = 5
  const BATCH = 10

  console.log('\n=== Serial (no pipelining) ===')
  const serialSimple = await runSerial('simple SELECT 1', SIMPLE, SECONDS)
  const serialParam = await runSerial('parameterized', PARAM, SECONDS)
  const serialNamed = await runSerial('named prepared', NAMED, SECONDS)

  console.log('\n=== Pipelined ===')
  const pipedSimple = await benchPipelined(
    'simple SELECT 1',
    (n) => Array.from({ length: n }, () => ({ text: 'SELECT 1' })),
    BATCH,
    SECONDS
  )
  const pipedParam = await benchPipelined(
    'parameterized',
    (n) => Array.from({ length: n }, () => ({ text: 'SELECT $1::int AS n', values: [42] })),
    BATCH,
    SECONDS
  )
  const pipedNamed = await benchPipelined(
    'named prepared',
    (n) => Array.from({ length: n }, (_, i) => ({ name: `bench-named-${i}`, text: 'SELECT $1::int AS n', values: [42] })),
    BATCH,
    SECONDS
  )

  console.log('\n=== Speedup ===')
  console.log(`  simple:       ${(pipedSimple / serialSimple).toFixed(2)}x`)
  console.log(`  parameterized: ${(pipedParam / serialParam).toFixed(2)}x`)
  console.log(`  named:        ${(pipedNamed / serialNamed).toFixed(2)}x`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
