import assert from 'node:assert'
import * as nodeDomain from 'node:domain'
import { describe, it } from 'vitest'
import helper from './_test-helper.ts'

describe('domain', () => {
  const Query = helper.pg.Query
  const Pool = helper.pg.Pool

  it('no domain', () =>
    new Promise<void>((cb) => {
      assert(!(process as unknown as { domain?: unknown }).domain)
      const pool = new Pool()
      pool.connect(
        assert.success((client: unknown, done: () => void) => {
          assert(!(process as unknown as { domain?: unknown }).domain)
          done()
          pool.end(cb)
        })
      )
    }))

  it('with domain', () =>
    new Promise<void>((cb) => {
      assert(!(process as unknown as { domain?: unknown }).domain)
      const pool = new Pool()
      const domain = nodeDomain.create()
      domain.run(() => {
        const startingDomain = (process as unknown as { domain?: unknown }).domain
        assert(startingDomain)
        pool.connect(
          assert.success((client: { query: Function }, done: (force?: boolean) => void) => {
            assert((process as unknown as { domain?: unknown }).domain, 'no domain exists in connect callback')
            assert.equal(
              startingDomain,
              (process as unknown as { domain?: unknown }).domain,
              'domain was lost when checking out a client'
            )
            client.query(
              'SELECT NOW()',
              assert.success(() => {
                assert((process as unknown as { domain?: unknown }).domain, 'no domain exists in query callback')
                assert.equal(
                  startingDomain,
                  (process as unknown as { domain?: unknown }).domain,
                  'domain was lost when checking out a client'
                )
                done(true)
                ;(process as unknown as { domain: { exit: () => void } }).domain.exit()
                pool.end(cb)
              })
            )
          })
        )
      })
    }))

  it('error on domain', () =>
    new Promise<void>((cb) => {
      const domain = nodeDomain.create()
      const pool = new Pool()
      domain.on('error', () => {
        pool.end(cb)
      })
      domain.run(() => {
        pool.connect(
          assert.success((client: { query: Function; on: Function }, done: () => void) => {
            client.query(new Query('SELECT SLDKJFLSKDJF'))
            client.on('drain', done)
          })
        )
      })
    }))
})
