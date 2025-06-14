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

const run = async () => {
  const client = new pg.Client()
  await client.connect()
  console.log('start')
  await client.query('CREATE TEMP TABLE foobar(name TEXT, age NUMERIC)')
  await client.query('CREATE TEMP TABLE buf(name TEXT, data BYTEA)')
  await bench(client, params, 1000)
  console.log('warmup done')
  const seconds = 5

  for (let i = 0; i < 4; i++) {
    let queries = await bench(client, params, seconds * 1000)
    console.log('')
    console.log('param queries:', queries)
    console.log('qps', queries / seconds)
    console.log('on my laptop best so far seen 987 qps')

    queries = await bench(client, { ...params, name: 'params' }, seconds * 1000)
    console.log('')
    console.log('named queries:', queries)
    console.log('qps', queries / seconds)
    console.log('on my laptop best so far seen 937 qps')

    console.log('')
    queries = await bench(client, seq, seconds * 1000)
    console.log('sequence queries:', queries)
    console.log('qps', queries / seconds)
    console.log('on my laptop best so far seen 2725 qps')

    console.log('')
    queries = await bench(client, insert, seconds * 1000)
    console.log('insert queries:', queries)
    console.log('qps', queries / seconds)
    console.log('on my laptop best so far seen 27383 qps')

    console.log('')
    console.log('Warming up bytea test')
    await client.query({
      text: 'INSERT INTO buf(name, data) VALUES ($1, $2)',
      values: ['test', Buffer.allocUnsafe(104857600)],
    })
    console.log('bytea warmup done')
    const start = performance.now()
    const results = await client.query('SELECT * FROM buf')
    const time = performance.now() - start
    console.log('bytea time:', time, 'ms')
    console.log('bytea length:', results.rows[0].data.byteLength, 'bytes')
    console.log('on my laptop best so far seen 1407ms and 104857600 bytes')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  await client.end()
  await client.end()
}

run().catch((e) => console.error(e) || process.exit(-1))
