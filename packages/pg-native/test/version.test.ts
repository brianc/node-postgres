import assert from 'node:assert'
import { describe, it } from 'vitest'
import Client, { version } from '../src/index.ts'

describe('version', () => {
  it('is exported', () => {
    assert(version)
    assert.equal(Client.version, version)
  })
})
