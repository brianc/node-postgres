import assert from 'node:assert'
import { Client } from 'pg'
import { describe, it } from 'vitest'
import Cursor from '../src/index.ts'

describe('transactions', () => {
  it('can execute multiple statements in a transaction', async () => {
    const client = new Client()
    await client.connect()
    await client.query('begin')
    await client.query('CREATE TEMP TABLE foobar(id SERIAL PRIMARY KEY)')
    const cursor = client.query(new Cursor('SELECT * FROM foobar'))
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      cursor.read(10, (err: Error | null, rows: unknown[]) => (err ? reject(err) : resolve(rows)))
    })
    assert.strictEqual(rows.length, 0)
    await client.query('ALTER TABLE foobar ADD COLUMN name TEXT')
    await client.end()
  })

  it('can execute multiple statements in a transaction if ending cursor early', async () => {
    const client = new Client()
    await client.connect()
    await client.query('begin')
    await client.query('CREATE TEMP TABLE foobar(id SERIAL PRIMARY KEY)')
    const cursor = client.query(new Cursor('SELECT * FROM foobar'))
    await new Promise<void>((resolve) => cursor.close(() => resolve()))
    await client.query('ALTER TABLE foobar ADD COLUMN name TEXT')
    await client.end()
  })

  it('can execute multiple statements in a transaction if no data', async () => {
    const client = new Client()
    await client.connect()
    await client.query('begin')
    // create a cursor that has no data response
    const createText = 'CREATE TEMP TABLE foobar(id SERIAL PRIMARY KEY)'
    const cursor = client.query(new Cursor(createText))
    const err = await new Promise<Error | null>((resolve) => cursor.read(100, (err: Error | null) => resolve(err)))
    assert.ifError(err)
    await client.query('ALTER TABLE foobar ADD COLUMN name TEXT')
    await client.end()
  })
})
