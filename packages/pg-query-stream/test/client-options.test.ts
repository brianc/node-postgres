import assert from 'node:assert'
import { Client } from 'pg'
import { describe, it } from 'vitest'
import QueryStream from '../src/index.ts'

describe('client options', () => {
  it('uses custom types from client config', () =>
    new Promise<void>((resolve) => {
      const types = {
        getTypeParser: () => (string: string) => string,
      }
      // @ts-expect-error -- types is not part of public ClientConfig
      const client = new Client({ types })
      client.connect()
      const stream = new QueryStream('SELECT * FROM generate_series(0, 10) num')
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
        client.end()
        resolve()
      })
    }))
})
