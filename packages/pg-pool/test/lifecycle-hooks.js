const describe = require('mocha').describe
const it = require('mocha').it
const expect = require('expect.js')

const Pool = require('..')

describe('lifecycle hooks', () => {
  it('are called on connect', async () => {
    const pool = new Pool({
      onConnect: (client) => {
        client.HOOK_CONNECT_COUNT = (client.HOOK_CONNECT_COUNT || 0) + 1
      },
    })
    const client = await pool.connect()
    expect(client.HOOK_CONNECT_COUNT).to.equal(1)
    client.release()
    const client2 = await pool.connect()
    expect(client).to.equal(client2)
    expect(client2.HOOK_CONNECT_COUNT).to.equal(1)
    client.release()
    await pool.end()
  })

  it('are called on connect with an async hook', async () => {
    const pool = new Pool({
      onConnect: async (client) => {
        const res = await client.query('SELECT 1 AS num')
        client.HOOK_CONNECT_RESULT = res.rows[0].num
      },
    })
    const client = await pool.connect()
    expect(client.HOOK_CONNECT_RESULT).to.equal(1)
    const res = await client.query('SELECT 1 AS num')
    expect(res.rows[0].num).to.equal(1)
    client.release()
    const client2 = await pool.connect()
    expect(client).to.equal(client2)
    expect(client2.HOOK_CONNECT_RESULT).to.equal(1)
    client.release()
    await pool.end()
  })

  it('errors out the connect call if the async connect hook rejects', async () => {
    const pool = new Pool({
      onConnect: async (client) => {
        await client.query('SELECT INVALID HERE')
      },
    })
    try {
      await pool.connect()
      throw new Error('Expected connect to throw')
    } catch (err) {
      expect(err.message).to.contain('invalid')
    }
    await pool.end()
  })

  it('calls onConnect when using pool.query', async () => {
    const pool = new Pool({
      onConnect: async (client) => {
        const res = await client.query('SELECT 1 AS num')
        client.HOOK_CONNECT_RESULT = res.rows[0].num
      },
    })
    const res = await pool.query('SELECT $1::text AS name', ['brianc'])
    expect(res.rows[0].name).to.equal('brianc')
    const client = await pool.connect()
    expect(client.HOOK_CONNECT_RESULT).to.equal(1)
    client.release()
    await pool.end()
  })

  it('recovers after a hook error', async () => {
    let shouldError = true
    const pool = new Pool({
      onConnect: () => {
        if (shouldError) {
          throw new Error('connect hook error')
        }
      },
    })
    try {
      await pool.connect()
      throw new Error('Expected connect to throw')
    } catch (err) {
      expect(err.message).to.equal('connect hook error')
    }
    shouldError = false
    const client = await pool.connect()
    const res = await client.query('SELECT 1 AS num')
    expect(res.rows[0].num).to.equal(1)
    client.release()
    await pool.end()
  })

  it('calls onConnect for each new client', async () => {
    let connectCount = 0
    const pool = new Pool({
      max: 2,
      onConnect: async (client) => {
        connectCount++
        await client.query('SELECT 1')
      },
    })
    const client1 = await pool.connect()
    const client2 = await pool.connect()
    expect(connectCount).to.equal(2)
    expect(client1).to.not.equal(client2)
    client1.release()
    client2.release()
    await pool.end()
  })

  it('errors out the connect call if the connect hook throws', async () => {
    const pool = new Pool({
      onConnect: () => {
        throw new Error('connect hook error')
      },
    })
    try {
      await pool.connect()
      throw new Error('Expected connect to throw')
    } catch (err) {
      expect(err.message).to.equal('connect hook error')
    }
    await pool.end()
  })
})
