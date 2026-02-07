const pg = require('pg').native
const Native = require('../')

const queryText = 'SELECT generate_series(0, 1000) as X, generate_series(0, 1000) as Y, generate_series(0, 1000) as Z'
const simpleQuery = 'SELECT 1'

const promisify = (client, text) => {
  return new Promise((resolve, reject) => {
    client.query(text, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

const bench = async (name, fn, durationMs) => {
  const start = performance.now()
  let count = 0
  while (performance.now() - start < durationMs) {
    await fn()
    count++
  }
  const elapsed = performance.now() - start
  const qps = Math.round((count / elapsed) * 1000)
  return { name, count, elapsed, qps }
}

const run = async () => {
  // Setup clients
  const pureClient = new pg.Client()
  await new Promise((resolve, reject) => {
    pureClient.connect((err) => (err ? reject(err) : resolve()))
  })

  const native = Native()
  native.connectSync()

  const nativePipeline = Native({ pipelineMode: true })
  nativePipeline.connectSync()
  const pipelineSupported = nativePipeline._pipelineEnabled

  console.log('='.repeat(60))
  console.log('pg-native Benchmark')
  console.log('='.repeat(60))
  console.log(`Pipeline mode supported: ${pipelineSupported}`)
  console.log('')

  const results = {
    simple: {},
    complex: {},
  }

  const warmupMs = 1000
  const benchMs = 5000
  const iterations = 3

  // Warmup
  console.log('Warming up...')
  await bench('warmup', () => promisify(pureClient, simpleQuery), warmupMs)
  await bench('warmup', () => promisify(native, simpleQuery), warmupMs)
  if (pipelineSupported) {
    await bench('warmup', () => promisify(nativePipeline, simpleQuery), warmupMs)
  }
  console.log('Warmup complete.\n')

  // Run benchmarks
  for (let i = 0; i < iterations; i++) {
    console.log(`--- Iteration ${i + 1}/${iterations} ---`)

    // Simple query benchmarks
    console.log('\nSimple query (SELECT 1):')

    let result = await bench('pg.native', () => promisify(pureClient, simpleQuery), benchMs)
    console.log(`  pg.native:         ${result.qps} qps (${result.count} queries in ${Math.round(result.elapsed)}ms)`)
    results.simple['pg.native'] = results.simple['pg.native'] || []
    results.simple['pg.native'].push(result.qps)

    result = await bench('Native', () => promisify(native, simpleQuery), benchMs)
    console.log(`  Native:            ${result.qps} qps (${result.count} queries in ${Math.round(result.elapsed)}ms)`)
    results.simple['Native'] = results.simple['Native'] || []
    results.simple['Native'].push(result.qps)

    if (pipelineSupported) {
      result = await bench('Native+Pipeline', () => promisify(nativePipeline, simpleQuery), benchMs)
      console.log(`  Native+Pipeline:   ${result.qps} qps (${result.count} queries in ${Math.round(result.elapsed)}ms)`)
      results.simple['Native+Pipeline'] = results.simple['Native+Pipeline'] || []
      results.simple['Native+Pipeline'].push(result.qps)
    }

    // Complex query benchmarks
    console.log('\nComplex query (generate_series):')

    result = await bench('pg.native', () => promisify(pureClient, queryText), benchMs)
    console.log(`  pg.native:         ${result.qps} qps (${result.count} queries in ${Math.round(result.elapsed)}ms)`)
    results.complex['pg.native'] = results.complex['pg.native'] || []
    results.complex['pg.native'].push(result.qps)

    result = await bench('Native', () => promisify(native, queryText), benchMs)
    console.log(`  Native:            ${result.qps} qps (${result.count} queries in ${Math.round(result.elapsed)}ms)`)
    results.complex['Native'] = results.complex['Native'] || []
    results.complex['Native'].push(result.qps)

    if (pipelineSupported) {
      result = await bench('Native+Pipeline', () => promisify(nativePipeline, queryText), benchMs)
      console.log(`  Native+Pipeline:   ${result.qps} qps (${result.count} queries in ${Math.round(result.elapsed)}ms)`)
      results.complex['Native+Pipeline'] = results.complex['Native+Pipeline'] || []
      results.complex['Native+Pipeline'].push(result.qps)
    }

    console.log('')
  }

  // Summary
  console.log('='.repeat(60))
  console.log('SUMMARY (average QPS over', iterations, 'iterations)')
  console.log('='.repeat(60))

  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)

  console.log('\nSimple query (SELECT 1):')
  for (const [name, qps] of Object.entries(results.simple)) {
    const avgQps = avg(qps)
    const improvement =
      name !== 'pg.native'
        ? ` (${((avgQps / avg(results.simple['pg.native']) - 1) * 100).toFixed(1)}% vs pg.native)`
        : ''
    console.log(`  ${name.padEnd(18)} ${avgQps} qps${improvement}`)
  }

  console.log('\nComplex query (generate_series):')
  for (const [name, qps] of Object.entries(results.complex)) {
    const avgQps = avg(qps)
    const improvement =
      name !== 'pg.native'
        ? ` (${((avgQps / avg(results.complex['pg.native']) - 1) * 100).toFixed(1)}% vs pg.native)`
        : ''
    console.log(`  ${name.padEnd(18)} ${avgQps} qps${improvement}`)
  }

  if (pipelineSupported) {
    const pipelineVsNativeSimple = (
      (avg(results.simple['Native+Pipeline']) / avg(results.simple['Native']) - 1) *
      100
    ).toFixed(1)
    const pipelineVsNativeComplex = (
      (avg(results.complex['Native+Pipeline']) / avg(results.complex['Native']) - 1) *
      100
    ).toFixed(1)
    console.log('\nPipeline mode impact:')
    console.log(`  Simple query:  ${pipelineVsNativeSimple}% vs Native without pipeline`)
    console.log(`  Complex query: ${pipelineVsNativeComplex}% vs Native without pipeline`)
  }

  console.log('\n' + '='.repeat(60))

  // Cleanup
  await new Promise((resolve) => pureClient.end(resolve))
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
