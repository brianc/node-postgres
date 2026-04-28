import assert from 'node:assert'

import { describe, it } from 'vitest'

import { client } from './_test-helper.ts'

const cases: Array<[string, number | null, number | null, string]> = [
  ['INSERT 0 3', 0, 3, 'INSERT'],
  ['INSERT 841 1', 841, 1, 'INSERT'],
  ['DELETE 10', null, 10, 'DELETE'],
  ['UPDATE 11', null, 11, 'UPDATE'],
  ['SELECT 20', null, 20, 'SELECT'],
  ['COPY', null, null, 'COPY'],
  ['COPY 12345', null, 12345, 'COPY'],
]

describe('result metadata', () => {
  for (const [tagText, oid, rowCount, command] of cases) {
    it(`includes command tag data for tag ${tagText}`, () =>
      new Promise<void>((resolve) => {
        const c = client()
        c.connection.emit('readyForQuery')
        c.query('whatever', (err, result) => {
          assert.ok(!err)
          const r = result as { oid: number | null; rowCount: number | null; command: string }
          if (oid !== null) assert.equal(r.oid, oid)
          assert.equal(r.rowCount, rowCount)
          assert.equal(r.command, command)
          resolve()
        })
        assert.equal(c.connection.queries.length, 1)
        c.connection.emit('commandComplete', { text: tagText })
        c.connection.emit('readyForQuery')
      }))
  }
})
