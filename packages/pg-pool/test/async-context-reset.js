'use strict'
const Pool = require('../')
const expect = require('expect.js')
const { AsyncLocalStorage } = require('async_hooks')

describe('async context on client reuse', () => {
  it('resets the socket handle async context when handing out an already-connected client', async () => {
    // Force every connect() after the first to reuse the SAME client.
    const pool = new Pool({ max: 1 })

    try {
      const first = await pool.connect()
      const handle = first.connection.stream._handle
      expect(handle).to.be.ok()
      expect(typeof handle.asyncReset).to.equal('function')

      let resetCalls = 0
      const originalAsyncReset = handle.asyncReset
      handle.asyncReset = function (...args) {
        resetCalls++
        return originalAsyncReset.apply(this, args)
      }

      first.release()

      const second = await pool.connect()
      try {
        expect(second).to.equal(first)
        expect(resetCalls).to.equal(1)
      } finally {
        second.release()
      }
    } finally {
      await pool.end()
    }
  })

  it('clears the legacy kResourceStore context when handing out a reused client', async () => {
    // On Node <24, AsyncLocalStorage stamps a resource with an internal
    // kResourceStore symbol at creation time; this only happens while an
    // ALS context is actually active, so one has to be running here for
    // the symbol to exist at all.
    const als = new AsyncLocalStorage()
    const pool = new Pool({ max: 1 })

    try {
      const first = await als.run('first-connect', () => pool.connect())
      const handle = first.connection.stream._handle
      const resourceStoreSymbol = Object.getOwnPropertySymbols(handle).find((symbol) =>
        symbol.toString().includes('kResourceStore')
      )

      if (!resourceStoreSymbol) {
        // Node 24+ tracks async context differently and never stamps this
        // symbol in the first place, so there's nothing to clear.
        first.release()
        return
      }

      expect(handle[resourceStoreSymbol]).to.equal('first-connect')

      first.release()

      const second = await pool.connect()
      try {
        expect(second).to.equal(first)
        expect(handle[resourceStoreSymbol]).to.equal(undefined)
      } finally {
        second.release()
      }
    } finally {
      await pool.end()
    }
  })

  it('does not leak the connecting context into a later query on a reused client', (done) => {
    const als = new AsyncLocalStorage()
    const pool = new Pool({ max: 1 })

    als.run('first-context', () => {
      pool.query('SELECT 1', (err) => {
        if (err) {
          return pool.end(() => done(err))
        }

        als.run('second-context', () => {
          pool.query('SELECT 1', (err2) => {
            if (err2) {
              return pool.end(() => done(err2))
            }

            let assertionError = null
            try {
              expect(als.getStore()).to.equal('second-context')
            } catch (e) {
              assertionError = e
            }
            pool.end(() => done(assertionError))
          })
        })
      })
    })
  })
})
