// test/my-module.test.js
import assert from 'node:assert'
import { describe, it } from 'node:test'
import pg, { Client, Pool } from 'pg'

describe('pg', () => {
  it('should export Client constructor', () => {
    assert.ok(new Client())
  })

  it('should export Pool constructor', () => {
    assert.ok(new Pool())
  })

  it('should still provide default export', () => {
    assert.ok(new pg.Pool())
  })
})
