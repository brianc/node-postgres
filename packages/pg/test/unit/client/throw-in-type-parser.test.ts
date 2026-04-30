import assert from 'node:assert'

import * as types from 'pg-types'

import { describe, it } from 'vitest'

import Query from '../../../src/query.ts'
import { client } from './_test-helper.ts'

const typeParserError = new Error('TEST: Throw in type parsers')

types.setTypeParser(99999999, () => {
  throw typeParserError
})

const emitFakeEvents = (con: { emit: (event: string, ...args: unknown[]) => boolean }): void => {
  setImmediate(() => {
    con.emit('readyForQuery')
    con.emit('rowDescription', {
      fields: [
        {
          name: 'boom',
          dataTypeID: 99999999,
        },
      ],
    })
    con.emit('dataRow', { fields: ['hi'] })
    con.emit('dataRow', { fields: ['hi'] })
    con.emit('commandComplete', { text: 'INSERT 31 1' })
    con.emit('readyForQuery')
  })
}

describe('throw in type parser', () => {
  it('emits error', () =>
    new Promise<void>((resolve) => {
      const c = client()
      const query = c.query(new Query('whatever')) as unknown as Query
      emitFakeEvents(c.connection)
      query.on('error', (err) => {
        assert.equal(err, typeParserError)
        resolve()
      })
    }))

  it('calls callback with error', () =>
    new Promise<void>((resolve) => {
      const c = client()
      emitFakeEvents(c.connection)
      c.query('whatever', (err) => {
        assert.equal(err, typeParserError)
        resolve()
      })
    }))

  it('rejects promise with error', () =>
    new Promise<void>((resolve) => {
      const c = client()
      emitFakeEvents(c.connection)
      ;(c.query('whatever') as Promise<unknown>).catch((err) => {
        assert.equal(err, typeParserError)
        resolve()
      })
    }))
})
