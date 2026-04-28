import assert from 'node:assert'
import { Transform } from 'node:stream'
import concat from 'concat-stream'
import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

helper('concat', (client) => {
  it('concats correctly', () =>
    new Promise<void>((resolve) => {
      const stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
      const query = client.query(stream)
      query
        .pipe(
          new Transform({
            transform(chunk, _, callback) {
              callback(null, chunk.num)
            },
            objectMode: true,
          })
        )
        .pipe(
          concat((result: number[]) => {
            const total = result.reduce((prev, cur) => prev + cur)
            assert.equal(total, 20100)
          })
        )
      stream.on('end', () => resolve())
    }))
})
