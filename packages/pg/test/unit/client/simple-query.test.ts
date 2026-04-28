import assert from 'node:assert'

import { describe, it } from 'vitest'

import Query from '../../../src/query.ts'
import { client } from './_test-helper.ts'

describe('executing query', () => {
  describe('queueing query', () => {
    it('when connection is ready', () => {
      const c = client()
      assert.equal(c.connection.queries.length, 0)
      c.connection.emit('readyForQuery')
      c.query('yes')
      assert.equal(c.connection.queries.length, 1)
      assert.equal(c.connection.queries[0], 'yes')
    })

    it('when connection is not ready', () => {
      const c = client()
      c.query('boom')
      assert.equal(c.connection.queries.length, 0)
      c.connection.emit('readyForQuery')
      assert.equal(c.connection.queries.length, 1)
      assert.equal(c.connection.queries[0], 'boom')
    })

    it('multiple in the queue', () => {
      const c = client()
      const queries = c.connection.queries
      c.query('one')
      c.query('two')
      c.query('three')
      assert.equal(queries.length, 0)

      c.connection.emit('readyForQuery')
      assert.equal(queries.length, 1)
      assert.equal(queries[0], 'one')

      c.connection.emit('readyForQuery')
      assert.equal(queries.length, 2)

      c.connection.emit('readyForQuery')
      c.connection.emit('readyForQuery')
      c.connection.emit('readyForQuery')
      assert.equal(queries.length, 3)
      assert.equal(queries[0], 'one')
      assert.equal(queries[1], 'two')
      assert.equal(queries[2], 'three')
    })
  })

  it('query event binding and flow', () =>
    new Promise<void>((resolve) => {
      const c = client()
      const con = c.connection
      const query = c.query(new Query('whatever')) as unknown as Query

      // before ready, no queries sent
      assert.equal(con.queries.length, 0)

      // sends on readyForQuery
      con.emit('readyForQuery')
      assert.equal(con.queries.length, 1)
      assert.equal(con.queries[0], 'whatever')

      // handles rowDescription
      const handled = con.emit('rowDescription', { fields: [{ name: 'boom' }] })
      assert.ok(handled)

      // first dataRow event
      const rows: Record<string, unknown>[] = []
      query.on('row', (row) => {
        rows.push(row)
        if (rows.length === 2) {
          assert.equal(rows[0]['boom'], 'hi')
          assert.equal(rows[1]['boom'], 'bye')
          resolve()
        }
      })
      const handled1 = con.emit('dataRow', { fields: ['hi'] })
      assert.ok(handled1)
      const handled2 = con.emit('dataRow', { fields: ['bye'] })
      assert.ok(handled2)

      con.emit('commandComplete', { text: 'INSERT 31 1' })
    }))

  describe('handles errors', () => {
    it('throws when config is null', () => {
      const c = client()
      assert.throws(() => c.query(null as never, undefined), /Client was passed a null or undefined query/)
    })

    it('throws when config is undefined', () => {
      const c = client()
      assert.throws(
        () => (c.query as (cfg: unknown) => unknown)(undefined),
        /Client was passed a null or undefined query/
      )
    })
  })
})
