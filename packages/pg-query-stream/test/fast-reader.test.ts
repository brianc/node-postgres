import assert from 'node:assert'
import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

helper('fast reader', (client) => {
  it('works', () =>
    new Promise<void>((resolve) => {
      const stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
      const query = client.query(stream)
      const result: number[] = []
      stream.on('readable', () => {
        let res = stream.read()
        while (res) {
          if (result.length !== 201) {
            assert(res, 'should not return null on evented reader')
          } else {
            // a readable stream will emit a null datum when it finishes being readable
            // https://nodejs.org/api/stream.html#stream_event_readable
            assert.equal(res, null)
          }
          if (res) {
            result.push(res.num)
          }
          res = stream.read()
        }
      })
      stream.on('end', () => {
        const total = result.reduce((prev, cur) => prev + cur)
        assert.equal(total, 20100)
        resolve()
      })
      assert.strictEqual(query.read(2), null)
    }))
})
