import assert from 'assert'
import { describe, it } from 'node:test'
import Client from 'pg-native'

describe('pg-native', () => {
  it('should export Client constructor', () => {
    assert.ok(new Client())
  })
})
