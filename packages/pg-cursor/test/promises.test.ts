import assert from 'node:assert'
import { Client } from 'pg'
import { afterEach, beforeEach, describe, it } from 'vitest'
import Cursor from '../src/index.ts'

const text = 'SELECT generate_series as num FROM generate_series(0, 5)'

describe('cursor using promises', () => {
  let client: Client
  let pgCursor: (text: string, values?: unknown[]) => InstanceType<typeof Cursor>

  beforeEach(async () => {
    client = new Client()
    await client.connect()
    pgCursor = (text: string, values?: unknown[]) => client.query(new Cursor(text, values || []))
  })

  afterEach(() => {
    client.end()
  })

  it('resolve with result', async () => {
    const cursor = pgCursor(text)
    const res = await cursor.read(6)
    assert.strictEqual(res.length, 6)
  })

  it('reject with error', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor('select asdfasdf')
      cursor.read(1).catch((err: Error) => {
        assert(err)
        resolve()
      })
    }))

  it('read multiple times', async () => {
    const cursor = pgCursor(text)
    let res

    res = await cursor.read(2)
    assert.strictEqual(res.length, 2)

    res = await cursor.read(3)
    assert.strictEqual(res.length, 3)

    res = await cursor.read(1)
    assert.strictEqual(res.length, 1)

    res = await cursor.read(1)
    assert.strictEqual(res.length, 0)
  })
})
