import { describe, it } from 'vitest'
import assert from 'node:assert'
import helper from './../_test-helper.ts'

describe('2108', () => {
  it('Closing an unconnected client calls callback', () =>
    new Promise<void>((done) => {
      const client = new helper.pg.Client()
      client.end(done)
    }))

  it('Closing an unconnected client resolves promise', () => {
    const client = new helper.pg.Client()
    return client.end()
  })
})
