import assert from 'node:assert'
import { Client } from 'pg'
import { afterEach, beforeEach, describe, it } from 'vitest'
import Cursor from '../src/index.ts'

const text = 'SELECT generate_series as num FROM generate_series(0, 50)'

describe('close', () => {
  let client: Client

  beforeEach(async () => {
    client = new Client()
    await client.connect()
  })

  afterEach(async () => {
    await client.end()
  })

  it('can close a finished cursor without a callback', () =>
    new Promise<void>((resolve) => {
      const cursor = new Cursor(text)
      client.query(cursor)
      cursor.read(100, (err) => {
        assert.ifError(err)
        cursor.close()
      })
      client.once('drain', resolve)
    }))

  it('can close a finished cursor a promise', () =>
    new Promise<void>((resolve, reject) => {
      const cursor = new Cursor(text)
      client.query(cursor)
      cursor.read(100, (err) => {
        assert.ifError(err)
        cursor.close().then(() => {
          client.query('SELECT NOW()', (e) => (e ? reject(e) : resolve()))
        }, reject)
      })
    }))

  it('closes cursor early', () =>
    new Promise<void>((resolve) => {
      const cursor = new Cursor(text)
      client.query(cursor)
      cursor.read(25, (err) => {
        assert.ifError(err)
        cursor.close()
      })
      client.once('drain', resolve)
    }))

  it('works with callback style', () =>
    new Promise<void>((resolve, reject) => {
      const cursor = new Cursor(text)
      client.query(cursor)
      cursor.read(25, (err, rows) => {
        assert.ifError(err)
        assert.strictEqual(rows!.length, 25)
        cursor.close((err2) => {
          assert.ifError(err2)
          client.query('SELECT NOW()', (e) => (e ? reject(e) : resolve()))
        })
      })
    }))

  it('is a no-op to "close" the cursor before submitting it', () =>
    new Promise<void>((resolve) => {
      const cursor = new Cursor(text)
      cursor.close(() => resolve())
    }))
})
