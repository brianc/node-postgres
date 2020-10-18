import Pool from '../'
import assert from 'assert'

const wait = (time) => new Promise((resolve) => setTimeout(resolve, time))

describe('idle timeout', () => {
  it('should timeout and remove the client', (done) => {
    const pool = new Pool({ idleTimeoutMillis: 10 })
    pool.query('SELECT NOW()')
    pool.on('remove', () => {
      assert.strictEqual(pool.idleCount, 0)
      assert.strictEqual(pool.totalCount, 0)
      done()
    })
  })

  it('times out and removes clients when others are also removed', async () => {
    const pool = new Pool({ idleTimeoutMillis: 10 })
    const clientA = await pool.connect()
    const clientB = await pool.connect()
    clientA.release()
    clientB.release(new Error())

    const removal = new Promise((resolve) => {
      pool.on('remove', () => {
        assert.strictEqual(pool.idleCount, 0)
        assert.strictEqual(pool.totalCount, 0)
        resolve()
      })
    })

    const timeout = wait(100).then(() => Promise.reject(new Error('Idle timeout failed to occur')))

    try {
      await Promise.race([removal, timeout])
    } finally {
      pool.end()
    }
  })

  it('can remove idle clients and recreate them', async () => {
    const pool = new Pool({ idleTimeoutMillis: 1 })
    const results = []
    for (var i = 0; i < 20; i++) {
      let query = pool.query('SELECT NOW()')
      assert.strictEqual(pool.idleCount, 0)
      assert.strictEqual(pool.totalCount, 1)
      results.push(await query)
      await wait(2)
      assert.strictEqual(pool.idleCount, 0)
      assert.strictEqual(pool.totalCount, 0)
    }
    assert.strictEqual(results.length, 20)
  })

  it('does not time out clients which are used', async () => {
    const pool = new Pool({ idleTimeoutMillis: 1 })
    const results = []
    for (var i = 0; i < 20; i++) {
      let client = await pool.connect()
      assert.strictEqual(pool.totalCount, 1)
      assert.strictEqual(pool.idleCount, 0)
      await wait(10)
      results.push(await client.query('SELECT NOW()'))
      client.release()
      assert.strictEqual(pool.idleCount, 1)
      assert.strictEqual(pool.totalCount, 1)
    }
    assert.strictEqual(results.length, 20)
    return pool.end()
  })
})
