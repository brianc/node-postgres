import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('maxUses', () => {
  it('can create a single client and use it once', async () => {
    const pool = new Pool({ maxUses: 2 })
    expect(pool.waitingCount).toBe(0)
    const client = await pool.connect()
    const res: any = await client.query('SELECT $1::text as name', ['hi'])
    expect(res.rows[0].name).toBe('hi')
    client.release()
    pool.end()
  })

  it('getting a connection a second time returns the same connection and releasing it also closes it', async () => {
    const pool = new Pool({ maxUses: 2 })
    expect(pool.waitingCount).toBe(0)
    const client = await pool.connect()
    client.release()
    const client2: any = await pool.connect()
    expect(client).toBe(client2)
    expect(client2._ending).toBe(false)
    client2.release()
    expect(client2._ending).toBe(true)
    return pool.end()
  })

  it('getting a connection a third time returns a new connection', async () => {
    const pool = new Pool({ maxUses: 2 })
    expect(pool.waitingCount).toBe(0)
    const client = await pool.connect()
    client.release()
    const client2 = await pool.connect()
    expect(client).toBe(client2)
    client2.release()
    const client3 = await pool.connect()
    expect(client3).not.toBe(client2)
    client3.release()
    return pool.end()
  })

  it('getting a connection from a pending request gets a fresh client when the released candidate is expended', async () => {
    const pool = new Pool({ max: 1, maxUses: 2 })
    expect(pool.waitingCount).toBe(0)
    const client1 = await pool.connect()
    pool.connect().then((client2) => {
      expect(client2).toBe(client1)
      expect(pool.waitingCount).toBe(1)
      // Releasing the client this time should also expend it since maxUses is 2, causing client3 to be a fresh client
      client2.release()
    })
    const client3Promise = pool.connect().then((client3) => {
      // client3 should be a fresh client since client2's release caused the first client to be expended
      expect(pool.waitingCount).toBe(0)
      expect(client3).not.toBe(client1)
      return client3.release()
    })
    // There should be two pending requests since we have 3 connect requests but a max size of 1
    expect(pool.waitingCount).toBe(2)
    // Releasing the client should not yet expend it since maxUses is 2
    client1.release()
    await client3Promise
    return pool.end()
  })

  it('logs when removing an expended client', async () => {
    const messages: unknown[] = []
    const log = (msg: unknown) => {
      messages.push(msg)
    }
    const pool = new Pool({ maxUses: 1, log })
    const client = await pool.connect()
    client.release()
    expect(messages).toContain('remove expended client')
    return pool.end()
  })
})
