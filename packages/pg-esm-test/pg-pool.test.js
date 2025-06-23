import assert from 'node:assert'
import { describe, it } from 'node:test'
import Pool from 'pg-pool'

describe('pg-pool', () => {
  it('should export Pool constructor', () => {
    assert.ok(new Pool())
  })
})
