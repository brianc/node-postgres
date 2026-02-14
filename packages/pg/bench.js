const pg = require('./lib')

const params = {
  text: 'select typname, typnamespace, typowner, typlen, typbyval, typcategory, typispreferred, typisdefined, typdelim, typrelid, typelem, typarray from pg_type where typtypmod = $1 and typisdefined = $2',
  values: [-1, true],
}

const insert = {
  text: 'INSERT INTO foobar(name, age) VALUES ($1, $2)',
  values: ['brian', 100],
}

const seq = {
  text: 'SELECT * FROM generate_series(1, 1000)',
}

const exec = async (client, q) => {
  await client.query({
    text: q.text,
    values: q.values,
    rowMode: 'array',
  })
}

const bench = async (client, q, time) => {
  const start = performance.now()
  let count = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await exec(client, q)
    count++
    if (performance.now() - start > time) {
      return count
    }
  }
}

// Pipeline mode benchmark - sends N queries concurrently
const benchPipeline = async (client, q, time, batchSize = 100) => {
  const start = performance.now()
  let count = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const promises = []
    for (let i = 0; i < batchSize; i++) {
      promises.push(
        client.query({
          text: q.text,
          values: q.values,
          rowMode: 'array',
        })
      )
    }
    await Promise.all(promises)
    count += batchSize
    if (performance.now() - start > time) {
      return count
    }
  }
}

const run = async () => {
  const seconds = 5

  console.log('='.repeat(60))
  console.log('STANDARD MODE BENCHMARK')
  console.log('='.repeat(60))

  const client = new pg.Client()
  await client.connect()
  await client.query('CREATE TEMP TABLE foobar(name TEXT, age NUMERIC)')
  await client.query('CREATE TEMP TABLE buf(name TEXT, data BYTEA)')
  await bench(client, params, 1000)
  console.log('warmup done\n')

  let queries = await bench(client, params, seconds * 1000)
  console.log('param queries:', queries)
  console.log('qps:', (queries / seconds).toFixed(0))

  queries = await bench(client, { ...params, name: 'params' }, seconds * 1000)
  console.log('\nnamed queries:', queries)
  console.log('qps:', (queries / seconds).toFixed(0))

  queries = await bench(client, seq, seconds * 1000)
  console.log('\nsequence queries:', queries)
  console.log('qps:', (queries / seconds).toFixed(0))

  queries = await bench(client, insert, seconds * 1000)
  console.log('\ninsert queries:', queries)
  console.log('qps:', (queries / seconds).toFixed(0))

  await client.end()

  console.log('\n')
  console.log('='.repeat(60))
  console.log('PIPELINE MODE BENCHMARK')
  console.log('='.repeat(60))

  const pipelineClient = new pg.Client({ pipelineMode: true })
  await pipelineClient.connect()
  await pipelineClient.query('CREATE TEMP TABLE foobar(name TEXT, age NUMERIC)')
  await benchPipeline(pipelineClient, params, 1000)
  console.log('warmup done\n')

  queries = await benchPipeline(pipelineClient, params, seconds * 1000)
  console.log('param queries:', queries)
  console.log('qps:', (queries / seconds).toFixed(0))

  queries = await benchPipeline(pipelineClient, { ...params, name: 'params' }, seconds * 1000)
  console.log('\nnamed queries:', queries)
  console.log('qps:', (queries / seconds).toFixed(0))

  queries = await benchPipeline(pipelineClient, seq, seconds * 1000)
  console.log('\nsequence queries:', queries)
  console.log('qps:', (queries / seconds).toFixed(0))

  queries = await benchPipeline(pipelineClient, insert, seconds * 1000)
  console.log('\ninsert queries:', queries)
  console.log('qps:', (queries / seconds).toFixed(0))

  await pipelineClient.end()

  console.log('\n')
  console.log('='.repeat(60))
  console.log('COMPARISON: Sequential vs Pipeline (same workload)')
  console.log('='.repeat(60))

  // Direct comparison: 1000 queries
  const numQueries = 1000

  const seqClient = new pg.Client()
  await seqClient.connect()

  console.log(`\nRunning ${numQueries} sequential queries...`)
  let start = performance.now()
  for (let i = 0; i < numQueries; i++) {
    await seqClient.query('SELECT $1::int as i', [i])
  }
  const seqTime = performance.now() - start
  console.log(`Sequential: ${seqTime.toFixed(0)}ms (${((numQueries / seqTime) * 1000).toFixed(0)} qps)`)

  await seqClient.end()

  const pipClient = new pg.Client({ pipelineMode: true })
  await pipClient.connect()

  console.log(`Running ${numQueries} pipeline queries...`)
  start = performance.now()
  const promises = []
  for (let i = 0; i < numQueries; i++) {
    promises.push(pipClient.query('SELECT $1::int as i', [i]))
  }
  await Promise.all(promises)
  const pipTime = performance.now() - start
  console.log(`Pipeline:   ${pipTime.toFixed(0)}ms (${((numQueries / pipTime) * 1000).toFixed(0)} qps)`)

  console.log(`\nSpeedup: ${(seqTime / pipTime).toFixed(2)}x faster`)

  await pipClient.end()
}

run().catch((e) => console.error(e) || process.exit(-1))
