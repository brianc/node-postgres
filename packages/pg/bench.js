const pg = require('./lib')
const pool = new pg.Pool()

const params = {
  text:
    'select typname, typnamespace, typowner, typlen, typbyval, typcategory, typispreferred, typisdefined, typdelim, typrelid, typelem, typarray from pg_type where typtypmod = $1 and typisdefined = $2',
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
  const result = await client.query({
    text: q.text,
    values: q.values,
    rowMode: 'array',
  })
}

const bench = async (client, q, time) => {
  let start = Date.now()
  let count = 0
  while (true) {
    await exec(client, q)
    count++
    if (Date.now() - start > time) {
      return count
    }
  }
}

const run = async () => {
  const client = new pg.Client()
  await client.connect()
  await client.query('CREATE TEMP TABLE foobar(name TEXT, age NUMERIC)')
  await bench(client, params, 1000)
  console.log('warmup done')
  const seconds = 5

  let queries = await bench(client, params, seconds * 1000)
  console.log('')
  console.log('little queries:', queries)
  console.log('qps', queries / seconds)
  console.log('on my laptop best so far seen 733 qps')

  console.log('')
  queries = await bench(client, seq, seconds * 1000)
  console.log('sequence queries:', queries)
  console.log('qps', queries / seconds)
  console.log('on my laptop best so far seen 1309 qps')

  console.log('')
  queries = await bench(client, insert, seconds * 1000)
  console.log('insert queries:', queries)
  console.log('qps', queries / seconds)
  console.log('on my laptop best so far seen 5799 qps')
  console.log()
  await client.end()
  await client.end()
}

run().catch((e) => console.error(e) || process.exit(-1))
