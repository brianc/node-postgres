import assert from 'node:assert'
import concat from 'concat-stream'
import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

helper('instant', (client) => {
  it('instant', () =>
    new Promise<void>((resolve) => {
      const query = new QueryStream('SELECT pg_sleep(1)', [])
      const stream = client.query(query)
      stream.pipe(
        concat((res: unknown[]) => {
          assert.equal(res.length, 1)
          resolve()
        })
      )
    }))
})
