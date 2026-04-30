import assert from 'node:assert'

import { describe, it } from 'vitest'

import Query from '../../../src/query.ts'
import { client } from './_test-helper.ts'

describe('query timeout', () => {
  it('Submittable without callback delivers error via handleError', () =>
    new Promise<void>((resolve) => {
      const c = client()
      ;(c as unknown as { connectionParameters: { query_timeout: number } }).connectionParameters = {
        query_timeout: 10,
      }

      const query = new Query({ text: 'SELECT 1' })
      query.handleError = (err) => {
        assert.equal(err.message, 'Query read timeout')
        resolve()
      }

      c.connection.emit('readyForQuery')
      c.query(query)
    }))

  it('Submittable with callback delivers error via callback', () =>
    new Promise<void>((resolve) => {
      const c = client()
      ;(c as unknown as { connectionParameters: { query_timeout: number } }).connectionParameters = {
        query_timeout: 10,
      }

      const query = new Query({ text: 'SELECT 1' })
      c.connection.emit('readyForQuery')

      c.query(query, (err) => {
        assert.equal((err as Error).message, 'Query read timeout')
        resolve()
      })
    }))
})
