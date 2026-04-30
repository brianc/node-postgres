import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('lifecycle hooks', () => {
  it('are called on connect', async () => {
    const pool = new Pool({
      onConnect: (client: any) => {
        client.HOOK_CONNECT_COUNT = (client.HOOK_CONNECT_COUNT || 0) + 1
      },
    })
    const client: any = await pool.connect()
    expect(client.HOOK_CONNECT_COUNT).toBe(1)
    client.release()
    const client2: any = await pool.connect()
    expect(client).toBe(client2)
    expect(client2.HOOK_CONNECT_COUNT).toBe(1)
    client.release()
    await pool.end()
  })

  it('are called on connect with an async hook', async () => {
    const pool = new Pool({
      onConnect: async (client: any) => {
        const res: any = await client.query('SELECT 1 AS num')
        client.HOOK_CONNECT_RESULT = res.rows[0].num
      },
    })
    const client: any = await pool.connect()
    expect(client.HOOK_CONNECT_RESULT).toBe(1)
    const res: any = await client.query('SELECT 1 AS num')
    expect(res.rows[0].num).toBe(1)
    client.release()
    const client2: any = await pool.connect()
    expect(client).toBe(client2)
    expect(client2.HOOK_CONNECT_RESULT).toBe(1)
    client.release()
    await pool.end()
  })

  it('errors out the connect call if the async connect hook rejects', async () => {
    const pool = new Pool({
      onConnect: async (client: any) => {
        await client.query('SELECT INVALID HERE')
      },
    })
    try {
      await pool.connect()
      throw new Error('Expected connect to throw')
    } catch (err) {
      expect((err as Error).message).toContain('invalid')
    }
    await pool.end()
  })

  it('calls onConnect when using pool.query', async () => {
    const pool = new Pool({
      onConnect: async (client: any) => {
        const res: any = await client.query('SELECT 1 AS num')
        client.HOOK_CONNECT_RESULT = res.rows[0].num
      },
    })
    const res: any = await pool.query('SELECT $1::text AS name', ['brianc'])
    expect(res.rows[0].name).toBe('brianc')
    const client: any = await pool.connect()
    expect(client.HOOK_CONNECT_RESULT).toBe(1)
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
      expect((err as Error).message).toBe('connect hook error')
    }
    shouldError = false
    const client = await pool.connect()
    const res: any = await client.query('SELECT 1 AS num')
    expect(res.rows[0].num).toBe(1)
    client.release()
    await pool.end()
  })

  it('calls onConnect for each new client', async () => {
    let connectCount = 0
    const pool = new Pool({
      max: 2,
      onConnect: async (client: any) => {
        connectCount++
        await client.query('SELECT 1')
      },
    })
    const client1 = await pool.connect()
    const client2 = await pool.connect()
    expect(connectCount).toBe(2)
    expect(client1).not.toBe(client2)
    client1.release()
    client2.release()
    await pool.end()
  })

  it('cleans up clients after repeated hook failures', async () => {
    let errorCount = 0
    const pool = new Pool({
      max: 2,
      onConnect: () => {
        if (errorCount < 10) {
          errorCount++
          throw new Error('connect hook error')
        }
      },
    })
    for (let i = 0; i < 10; i++) {
      let threw = false
      try {
        await pool.connect()
      } catch (err) {
        threw = true
        expect((err as Error).message).toBe('connect hook error')
      }
      expect(threw).toBe(true)
    }
    expect(errorCount).toBe(10)
    expect(pool.totalCount).toBe(0)
    expect(pool.idleCount).toBe(0)
    const client1 = await pool.connect()
    const res1: any = await client1.query('SELECT 1 AS num')
    expect(res1.rows[0].num).toBe(1)
    const client2 = await pool.connect()
    const res2: any = await client2.query('SELECT 2 AS num')
    expect(res2.rows[0].num).toBe(2)
    expect(pool.totalCount).toBe(2)
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
      expect((err as Error).message).toBe('connect hook error')
    }
    await pool.end()
  })
})
