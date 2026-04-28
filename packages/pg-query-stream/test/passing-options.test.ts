import assert from 'node:assert'
import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

helper('passing options', (client) => {
  it('passes row mode array', () =>
    new Promise<void>((resolve) => {
      const stream = new QueryStream('SELECT * FROM generate_series(0, 10) num', [], { rowMode: 'array' })
      const query = client.query(stream)
      const result: unknown[] = []
      query.on('data', (datum: unknown) => {
        result.push(datum)
      })
      query.on('end', () => {
        const expected = new Array(11).fill(0).map((_, i) => [i])
        assert.deepEqual(result, expected)
        resolve()
      })
    }))

  it('passes custom types', () =>
    new Promise<void>((resolve) => {
      const types = {
        getTypeParser: (): ((value: unknown) => unknown) => (s) => s,
      }
      const stream = new QueryStream('SELECT * FROM generate_series(0, 10) num', [], { types })
      const query = client.query(stream)
      const result: unknown[] = []
      query.on('data', (datum: unknown) => {
        result.push(datum)
      })
      query.on('end', () => {
        const expected = new Array(11).fill(0).map((_, i) => ({
          num: i.toString(),
        }))
        assert.deepEqual(result, expected)
        resolve()
      })
    }))
})
