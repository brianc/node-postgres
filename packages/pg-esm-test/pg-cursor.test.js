import assert from 'assert'
import { describe, it } from 'test'
import Cursor from 'pg-cursor'

describe('pg-cursor', () => {
  it('should export Cursor constructor as default', () => {
    assert.ok(new Cursor())
  })
})
