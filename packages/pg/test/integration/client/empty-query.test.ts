import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('empty-query', () => {
  it('empty query message handling', () =>
    new Promise<void>((done) => {
      const client = helper.client()
      assert.emits(client, 'drain', function () {
        client.end(done)
      })
      client.query({ text: '' })
    }))

  it('callback supported', () =>
    new Promise<void>((done) => {
      const client = helper.client()
      client.query('', function (err, result) {
        assert(!err)
        assert.empty(result.rows)
        client.end(done)
      })
    }))
})
