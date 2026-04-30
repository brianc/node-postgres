import assert from 'node:assert'
import { Client } from 'pg'
import { afterEach, beforeEach, describe, it } from 'vitest'
import Cursor from '../src/index.ts'

describe('queries with no data', () => {
  let client: Client

  beforeEach(async () => {
    client = new Client()
    await client.connect()
  })

  afterEach(() => {
    client.end()
  })

  it('handles queries that return no data', () =>
    new Promise<void>((resolve) => {
      const cursor = new Cursor('CREATE TEMPORARY TABLE whatwhat (thing int)')
      client.query(cursor)
      cursor.read(100, (err, rows) => {
        assert.ifError(err)
        assert.strictEqual(rows!.length, 0)
        resolve()
      })
    }))

  it('handles empty query', () =>
    new Promise<void>((resolve) => {
      let cursor = new Cursor('-- this is a comment')
      cursor = client.query(cursor)
      cursor.read(100, (err, rows) => {
        assert.ifError(err)
        assert.strictEqual(rows!.length, 0)
        resolve()
      })
    }))
})
