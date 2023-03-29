import pg from 'pg'
import BatchQuery from './dist'

const insert = (value) => ({
  text: 'INSERT INTO foobar(name, age) VALUES ($1, $2)',
  values: ['brian', value],
})

const seq = {
  text: 'SELECT * FROM generate_series(1, 1000)',
}

let counter = 0

const simpleExec = async (client, getQuery, count) => {
  const query = getQuery(count)
  await client.query({
    text: query.text,
    values: query.values,
    rowMode: 'array',
  })
}

const batchExec = async (client, getQuery, count) => {
  const query = getQuery(count)
  
  const batchQuery = new BatchQuery({
    name: 'optional'+ counter++,
    text: query.text,
    values: [
      ['brian1', '1'],
      ['brian2', '1'],
      ['brian3', '1'],
      ['brian4', '1'],
      ['brian5', '1']
    ]
  })
  await client.query(batchQuery).execute()
}

const bench = async (client, mainMethod, q, time) => {
  let start = Date.now()
  let count = 0
  while (true) {
    await mainMethod(client, q, count)
    count++
    if (Date.now() - start > time) {
      return count
    }
  }
}

const run = async () => {
  const client = new pg.Client()
  await client.connect()
  console.log('start')
  await client.query('CREATE TEMP TABLE foobar(name TEXT, age NUMERIC)')
  console.log('warmup done')
  const seconds = 5

  for (let i = 0; i < 4; i++) {
    let queries = await bench(client, simpleExec, insert, 5 * 1000)
    console.log('')
    console.log('insert queries:', queries)
    console.log('qps', queries / seconds)
    console.log('on my laptop best so far seen 12467 qps')

    queries = await bench(client, batchExec, insert, 5 * 1000)
    console.log('')
    console.log('insert batch queries:', queries * 5)
    console.log('qps', queries * 5 / seconds)
    console.log('on my laptop best so far seen 28796 qps')
  }

  await client.end()
  await client.end()
}

run().catch((e) => Boolean(console.error(e)) || process.exit(-1))
