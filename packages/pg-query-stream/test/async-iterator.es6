const QueryStream = require('../')
const pg = require('pg')
const assert = require('assert')

const queryText = 'SELECT * FROM generate_series(0, 200) num'
describe('Async iterator', () => {
  it('works', async () => {
    const stream = new QueryStream(queryText, [])
    const client = new pg.Client()
    await client.connect()
    const query = client.query(stream)
    const rows = []
    for await (const row of query) {
      rows.push(row)
    }
    assert.equal(rows.length, 201)
    await client.end()
  })

  it('can async iterate and then do a query afterwards', async () => {
    const stream = new QueryStream(queryText, [])
    const client = new pg.Client()
    await client.connect()
    const query = client.query(stream)
    const iteratorRows = []
    for await (const row of query) {
      iteratorRows.push(row)
    }
    assert.equal(iteratorRows.length, 201)
    const { rows } = await client.query('SELECT NOW()')
    assert.equal(rows.length, 1)
    await client.end()
  })

  it('can async iterate multiple times with a pool', async () => {
    const pool = new pg.Pool({ max: 1 })

    const allRows = []
    const run = async () => {
      // get the client
      const client = await pool.connect()
      // stream some rows
      const stream = new QueryStream(queryText, [])
      const iteratorRows = []
      client.query(stream)
      for await (const row of stream) {
        iteratorRows.push(row)
        allRows.push(row)
      }
      assert.equal(iteratorRows.length, 201)
      client.release()
    }
    await Promise.all([run(), run(), run()])
    assert.equal(allRows.length, 603)
    await pool.end()
  })

  it('can break out of iteration early', async () => {
    const pool = new pg.Pool({ max: 1 })
    const client = await pool.connect()
    const rows = []
    for await (const row of client.query(new QueryStream(queryText, [], { batchSize: 1 }))) {
      rows.push(row)
      break;
    }
    for await (const row of client.query(new QueryStream(queryText, []))) {
      rows.push(row)
      break;
    }
    for await (const row of client.query(new QueryStream(queryText, []))) {
      rows.push(row)
      break;
    }
    assert.strictEqual(rows.length, 3)
    client.release()
    await pool.end()
  })

  it('only returns rows on first iteration', async () => {
    const pool = new pg.Pool({ max: 1 })
    const client = await pool.connect()
    const rows = []
    const stream = client.query(new QueryStream(queryText, []))
    for await (const row of stream) {
      rows.push(row)
      break;
    }
    for await (const row of stream) {
      rows.push(row)
    }
    for await (const row of stream) {
      rows.push(row)
    }
    assert.strictEqual(rows.length, 1)
    client.release()
    await pool.end()
  })

  it('can read with delays', async () => {
    const pool = new pg.Pool({ max: 1 })
    const client = await pool.connect()
    const rows = []
    const stream = client.query(new QueryStream(queryText, [], { batchSize: 1 }))
    for await (const row of stream) {
      rows.push(row)
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    assert.strictEqual(rows.length, 201)
    client.release()
    await pool.end()
  })
})
