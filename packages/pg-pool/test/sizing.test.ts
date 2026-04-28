import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('pool size of 1', () => {
  it('can create a single client and use it once', async () => {
    const pool = new Pool({ max: 1 })
    expect(pool.waitingCount).toBe(0)
    const client = await pool.connect()
    const res: any = await client.query('SELECT $1::text as name', ['hi'])
    expect(res.rows[0].name).toBe('hi')
    client.release()
    pool.end()
  })

  it('can create a single client and use it multiple times', async () => {
    const pool = new Pool({ max: 1 })
    expect(pool.waitingCount).toBe(0)
    const client = await pool.connect()
    const wait = pool.connect()
    expect(pool.waitingCount).toBe(1)
    client.release()
    const client2 = await wait
    expect(client).toBe(client2)
    client2.release()
    return pool.end()
  })

  it('can only send 1 query at a time', async () => {
    const pool = new Pool({ max: 1 })

    // the query text column name changed in PostgreSQL 9.2
    const versionResult: any = await pool.query('SHOW server_version_num')
    const version = parseInt(versionResult.rows[0].server_version_num, 10)
    const queryColumn = version < 90200 ? 'current_query' : 'query'

    const queryText = 'SELECT COUNT(*) as counts FROM pg_stat_activity WHERE ' + queryColumn + ' = $1'
    const queries = Array.from({ length: 20 }, () => pool.query(queryText, [queryText]))
    const results = await Promise.all(queries)
    const counts = results.map((res: any) => parseInt(res.rows[0].counts, 10))
    expect(counts).toEqual(Array.from({ length: 20 }, () => 1))
    return pool.end()
  })

  it('does not remove clients when at or below min', async () => {
    const pool = new Pool({ max: 1, min: 1, idleTimeoutMillis: 10 })
    const client = await pool.connect()
    client.release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pool.idleCount).toBe(1)
    return pool.end()
  })

  it('does remove clients when at or below min if maxUses is reached', async () => {
    const pool = new Pool({ max: 1, min: 1, idleTimeoutMillis: 10, maxUses: 1 })
    const client = await pool.connect()
    client.release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pool.idleCount).toBe(0)
    return pool.end()
  })

  it('does remove clients when at or below min if maxLifetimeSeconds is reached', async () => {
    const pool = new Pool({ max: 1, min: 1, idleTimeoutMillis: 10, maxLifetimeSeconds: 1 })
    const client = await pool.connect()
    client.release()
    await new Promise((resolve) => setTimeout(resolve, 1020))
    expect(pool.idleCount).toBe(0)
    return pool.end()
  })
})

describe('pool size of 2', () => {
  it('does not remove clients when at or below min', async () => {
    const pool = new Pool({ max: 2, min: 2, idleTimeoutMillis: 10 })
    const client = await pool.connect()
    const client2 = await pool.connect()
    client.release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    client2.release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pool.idleCount).toBe(2)
    return pool.end()
  })

  it('does remove clients when above min', async () => {
    const pool = new Pool({ max: 2, min: 1, idleTimeoutMillis: 10 })
    const client = await pool.connect()
    const client2 = await pool.connect()
    client.release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    client2.release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pool.idleCount).toBe(1)
    return pool.end()
  })
})

describe('pool min size', () => {
  it('does not drop below min when clients released at same time', async () => {
    const pool = new Pool({ max: 2, min: 1, idleTimeoutMillis: 10 })
    const client = await pool.connect()
    const client2 = await pool.connect()
    client.release()
    client2.release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pool.idleCount).toBe(1)
    return pool.end()
  })
})
