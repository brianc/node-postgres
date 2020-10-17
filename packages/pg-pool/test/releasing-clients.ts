import Pool from '../'
import assert from 'assert'

describe('releasing clients', () => {
  it('removes a client which cannot be queried', async () => {
    // make a pool w/ only 1 client
    const pool = new Pool({ max: 1 })
    assert.strictEqual(pool.totalCount, 0)
    const client = await pool.connect()
    assert.strictEqual(pool.totalCount, 1)
    assert.strictEqual(pool.idleCount, 0)
    // reach into the client and sever its connection
    client.connection.end()

    // wait for the client to error out
    const err = await new Promise((resolve) => client.once('error', resolve))
    assert.ok(err)
    assert.strictEqual(pool.totalCount, 1)
    assert.strictEqual(pool.idleCount, 0)

    // try to return it to the pool - this removes it because its broken
    client.release()
    assert.strictEqual(pool.totalCount, 0)
    assert.strictEqual(pool.idleCount, 0)

    // make sure pool still works
    const { rows } = await pool.query('SELECT NOW()')
    assert.ok(rows.length === 1)
    await pool.end()
  })

  it('removes a client which is ending', async () => {
    // make a pool w/ only 1 client
    const pool = new Pool({ max: 1 })
    assert.strictEqual(pool.totalCount, 0)
    const client = await pool.connect()
    assert.strictEqual(pool.totalCount, 1)
    assert.strictEqual(pool.idleCount, 0)
    // end the client gracefully (but you shouldn't do this with pooled clients)
    client.end()

    // try to return it to the pool
    client.release()
    assert.strictEqual(pool.totalCount, 0)
    assert.strictEqual(pool.idleCount, 0)

    // make sure pool still works
    const { rows } = await pool.query('SELECT NOW()')
    assert.strictEqual(rows.length, 1)
    await pool.end()
  })
})
