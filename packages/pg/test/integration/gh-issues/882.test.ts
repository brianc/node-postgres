import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'

describe('882', () => {
  it('882', async () => {
    // client should not hang on an empty query
    const client = helper.client()
    client.query({ name: 'foo1', text: null as never })
    client.query({ name: 'foo2', text: '   ' })
    client.query({ name: 'foo3', text: '' }, function () {
      client.end()
    })
  })
})
