import assert from 'node:assert'

import { describe, it } from 'vitest'

import Query from '../../../src/query.ts'
import { client } from './_test-helper.ts'

describe('bound command', () => {
  it('simple, unnamed bound command', () =>
    new Promise<void>((resolve) => {
      const c = client()
      const con = c.connection as unknown as Record<string, unknown>
      let parseArg: { name?: string; text?: string; types?: unknown } | null = null
      let bindArg: { statement?: string; portal?: string; values?: unknown[] } | null = null
      let executeArg: { portal?: string; rows?: unknown } | null = null
      let describeArg: { type?: string; name?: string } | null = null
      let syncCalled = false

      con.parse = (arg: unknown) => {
        parseArg = arg as never
        process.nextTick(() => (con.emit as (e: string) => void)('parseComplete'))
      }
      con.bind = (arg: unknown) => {
        bindArg = arg as never
        process.nextTick(() => (con.emit as (e: string) => void)('bindComplete'))
      }
      con.execute = (arg: unknown) => {
        executeArg = arg as never
        process.nextTick(() => {
          ;(con.emit as (e: string, m: unknown) => void)('rowData', { fields: [] })
          ;(con.emit as (e: string, m: unknown) => void)('commandComplete', { text: '' })
        })
      }
      con.describe = (arg: unknown) => {
        describeArg = arg as never
        process.nextTick(() => (con.emit as (e: string, m: unknown) => void)('rowDescription', { fields: [] }))
      }
      con.flush = () => {}
      con.sync = () => {
        syncCalled = true
        process.nextTick(() => (con.emit as (e: string) => void)('readyForQuery'))
      }

      ;(con.emit as (e: string) => void)('readyForQuery')

      const q = c.query(new Query({ text: 'select * from X where name = $1', values: ['hi'] })) as unknown as Query
      q.on('end', () => {
        assert.equal(parseArg!.name, undefined)
        assert.equal(parseArg!.text, 'select * from X where name = $1')
        assert.equal(parseArg!.types, undefined)

        assert.equal(bindArg!.statement, undefined)
        assert.equal(bindArg!.portal, '')
        assert.equal(bindArg!.values!.length, 1)
        assert.equal(bindArg!.values![0], 'hi')

        assert.equal(describeArg!.type, 'P')
        assert.equal(describeArg!.name, '')

        assert.equal(executeArg!.portal, '')
        assert.equal(executeArg!.rows, undefined)

        assert.ok(syncCalled)
        resolve()
      })
    }))

  it('prepared statement with explicit portal', () =>
    new Promise<void>((resolve) => {
      const c = client()
      const con = c.connection as unknown as Record<string, unknown>
      let portalBindArg: { portal?: string } | null = null
      let portalExecuteArg: { portal?: string } | null = null
      let portalDescribeArg: { name?: string } | null = null

      con.parse = () => {
        process.nextTick(() => (con.emit as (e: string) => void)('parseComplete'))
      }
      con.bind = (arg: unknown) => {
        portalBindArg = arg as never
        process.nextTick(() => (con.emit as (e: string) => void)('bindComplete'))
      }
      con.execute = (arg: unknown) => {
        portalExecuteArg = arg as never
        process.nextTick(() => {
          ;(con.emit as (e: string, m: unknown) => void)('rowData', { fields: [] })
          ;(con.emit as (e: string, m: unknown) => void)('commandComplete', { text: '' })
        })
      }
      con.describe = (arg: unknown) => {
        portalDescribeArg = arg as never
        process.nextTick(() => (con.emit as (e: string, m: unknown) => void)('rowDescription', { fields: [] }))
      }
      con.flush = () => {}
      con.sync = () => {
        process.nextTick(() => (con.emit as (e: string) => void)('readyForQuery'))
      }

      ;(con.emit as (e: string) => void)('readyForQuery')

      const q = c.query(
        new Query({ text: 'select * from X where name = $1', portal: 'myportal', values: ['hi'] })
      ) as unknown as Query
      q.on('end', () => {
        assert.equal(portalBindArg!.portal, 'myportal')
        assert.equal(portalDescribeArg!.name, 'myportal')
        assert.equal(portalExecuteArg!.portal, 'myportal')
        resolve()
      })
    }))
})
