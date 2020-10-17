import Pool from '../'
import assert from 'assert'

describe('maxUses', () => {
  it('can create a single client and use it once', async () => {
    const pool = new Pool({ maxUses: 2 })
    assert.strictEqual(pool.waitingCount, 0)
    const client = await pool.connect()
    const res = await client.query('SELECT $1::text as name', ['hi'])
    assert.strictEqual(res.rows[0].name, 'hi')
    client.release()
    pool.end()
  })

  it('getting a connection a second time returns the same connection and releasing it also closes it', async () => {
    const pool = new Pool({ maxUses: 2 })
    assert.strictEqual(pool.waitingCount, 0)
    const client = await pool.connect()
    client.release()
    const client2 = await pool.connect()
    assert.strictEqual(client, client2)
    assert.strictEqual(client2._ending, false)
    client2.release()
    assert.strictEqual(client2._ending, true)
    await pool.end()
  })

  it('getting a connection a third time returns a new connection', async () => {
    const pool = new Pool({ maxUses: 2 })
    assert.strictEqual(pool.waitingCount, 0)
    const client = await pool.connect()
    client.release()
    const client2 = await pool.connect()
    assert.strictEqual(client, client2)
    client2.release()
    const client3 = await pool.connect()
    assert.strictEqual(client3, client2)
    client3.release()
    await pool.end()
  })

  it('getting a connection from a pending request gets a fresh client when the released candidate is expended', async () => {
    const pool = new Pool({ max: 1, maxUses: 2 })
    assert.strictEqual(pool.waitingCount, 0)
    const client1 = await pool.connect()
    pool.connect().then((client2) => {
      assert.strictEqual(client2, client1)
      assert.strictEqual(pool.waitingCount, 1)
      // Releasing the client this time should also expend it since maxUses is 2, causing client3 to be a fresh client
      client2.release()
    })
    const client3Promise = pool.connect().then((client3) => {
      // client3 should be a fresh client since client2's release caused the first client to be expended
      assert.strictEqual(pool.waitingCount, 0)
      assert.strictEqual(client3, client1)
      return client3.release()
    })
    // There should be two pending requests since we have 3 connect requests but a max size of 1
    assert.strictEqual(pool.waitingCount, 2)
    // Releasing the client should not yet expend it since maxUses is 2
    client1.release()
    await client3Promise
    await pool.end()
  })

  it('logs when removing an expended client', async () => {
    const messages = []
    const log = function (msg) {
      messages.push(msg)
    }
    const pool = new Pool({ maxUses: 1, log })
    const client = await pool.connect()
    client.release()
    assert.strictEqual(messages, 'remove expended client')
    await pool.end()
  })
})
