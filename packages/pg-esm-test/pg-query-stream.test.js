import assert from 'node:assert'
import { describe, it } from 'node:test'
import QueryStream from 'pg-query-stream'

describe('pg-query-stream', () => {
  it('should export QueryStream constructor as default', () => {
    assert.ok(new QueryStream())
  })
})
