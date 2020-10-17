import Pool from '../'
import assert from 'assert'

describe('pool size of 1', () => {
  it('can create a single client and use it once', async () => {
    const pool = new Pool({ max: 1 })
    assert.strictEqual(pool.waitingCount, 0)
    const client = await pool.connect()
    const res = await client.query('SELECT $1::text as name', ['hi'])
    assert.strictEqual(res.rows[0].name, 'hi')
    client.release()
    pool.end()
  })

  it('can create a single client and use it multiple times', async () => {
    const pool = new Pool({ max: 1 })
    assert.strictEqual(pool.waitingCount, 0)
    const client = await pool.connect()
    const wait = pool.connect()
    assert.strictEqual(pool.waitingCount, 1)
    client.release()
    const client2 = await wait
    assert.strictEqual(client, client2)
    client2.release()
    await pool.end()
  })

  it('can only send 1 query at a time', async () => {
    const pool = new Pool({ max: 1 })

    // the query text column name changed in PostgreSQL 9.2
    const versionResult = await pool.query('SHOW server_version_num')
    const version = parseInt(versionResult.rows[0].server_version_num, 10)
    const queryColumn = version < 90200 ? 'current_query' : 'query'

    const queryText = 'SELECT COUNT(*) as counts FROM pg_stat_activity WHERE ' + queryColumn + ' = $1'
    const queries = new Array(20).map(() => pool.query(queryText, [queryText]))
    const results = await Promise.all(queries)
    const counts = results.map((res) => parseInt(res.rows[0].counts, 10))

    assert.strictEqual(counts, new Array(20).fill(1))

    await pool.end()
  })
})
