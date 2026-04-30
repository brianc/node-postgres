import assert from 'node:assert'
import { afterAll, beforeAll, describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('multiple statements', () => {
  let client: Client

  beforeAll(() => {
    client = new Client()
    client.connectSync()
  })

  afterAll(() => {
    client.end()
  })

  it('works with multiple queries', () =>
    new Promise<void>((resolve, reject) => {
      const text = `
    SELECT generate_series(1, 2) as foo;
    SELECT generate_series(10, 11) as bar;
    SELECT generate_series(20, 22) as baz;
    `
      client.query(text, (err, results) => {
        if (err) return reject(err)
        assert(Array.isArray(results))
        const r = results as unknown[]
        assert.equal(r.length, 3)
        assert(Array.isArray(r[0]))
        assert(Array.isArray(r[1]))
        assert(Array.isArray(r[2]))
        resolve()
      })
    }))
})
