import assert from 'node:assert'
import { Client } from 'pg'
import { describe, it } from 'vitest'
import Cursor from '../src/index.ts'

describe('query config passed to result', () => {
  it('passes rowMode to result', () =>
    new Promise<void>((resolve) => {
      const client = new Client()
      client.connect()
      const text = 'SELECT generate_series as num FROM generate_series(0, 5)'
      const cursor = client.query(new Cursor(text, null, { rowMode: 'array' }))
      cursor.read(10, (err: Error | null | undefined, rows?: unknown[]) => {
        assert(!err)
        assert.deepStrictEqual(rows, [[0], [1], [2], [3], [4], [5]])
        client.end()
        resolve()
      })
    }))

  it('passes types to result', () =>
    new Promise<void>((resolve) => {
      const client = new Client()
      client.connect()
      const text = 'SELECT generate_series as num FROM generate_series(0, 2)'
      const types = {
        getTypeParser: () => () => 'foo',
      }
      const cursor = client.query(new Cursor(text, null, { types }))
      cursor.read(10, (err: Error | null | undefined, rows?: unknown[]) => {
        assert(!err)
        assert.deepStrictEqual(rows, [{ num: 'foo' }, { num: 'foo' }, { num: 'foo' }])
        client.end()
        resolve()
      })
    }))
})
