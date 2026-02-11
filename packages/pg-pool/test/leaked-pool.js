'use strict'

const expect = require('expect.js')
const describe = require('mocha').describe
const it = require('mocha').it
const Pool = require('..')

describe('leaked connection pool', function () {
  describe('when evictOnOpenTransaction is true', function () {
    it('removes a client with an open transaction on release', async function () {
      const logMessages = []
      const pool = new Pool({
        max: 1,
        log: (msg) => logMessages.push(msg),
        evictOnOpenTransaction: true,
      })
      const client = await pool.connect()
      await client.query('BEGIN')
      expect(client._txStatus).to.be('T')

      client.release()
      expect(pool.totalCount).to.be(0)
      expect(pool.idleCount).to.be(0)
      expect(logMessages).to.contain('remove client due to open transaction')

      // pool recovers by creating a fresh connection
      const { rows } = await pool.query('SELECT 1 as num')
      expect(rows[0].num).to.be(1)
      expect(pool.totalCount).to.be(1)
      expect(pool.idleCount).to.be(1)

      await pool.end()
    })

    it('removes a client in a failed transaction state on release', async function () {
      const pool = new Pool({ max: 1, evictOnOpenTransaction: true })
      const client = await pool.connect()
      await client.query('BEGIN')
      try {
        await client.query('SELECT invalid_column FROM nonexistent_table')
      } catch (e) {
        // swallow the error to avoid pool close the connection
      }
      // The ReadyForQuery message with status 'E' may arrive on a separate I/O event.
      // Issue a follow-up query to ensure it has been processed — this will also fail
      // (since the transaction is aborted) but guarantees _txStatus is updated.
      try {
        await client.query('SELECT 1')
      } catch (e) {
        // expected — "current transaction is aborted"
      }
      expect(client._txStatus).to.be('E')

      client.release()
      expect(pool.totalCount).to.be(0)
      expect(pool.idleCount).to.be(0)

      // pool recovers by creating a fresh connection
      const { rows } = await pool.query('SELECT 1 as num')
      expect(rows[0].num).to.be(1)
      expect(pool.totalCount).to.be(1)
      expect(pool.idleCount).to.be(1)

      await pool.end()
    })

    it('only removes connections with open transactions, keeps idle ones', async function () {
      const pool = new Pool({ max: 3, evictOnOpenTransaction: true })
      const clientA = await pool.connect()
      const clientB = await pool.connect()
      const clientC = await pool.connect()

      // Client A: open transaction (leaked)
      await clientA.query('BEGIN')
      expect(clientA._txStatus).to.be('T')

      // Client B: normal query (idle)
      await clientB.query('SELECT 1')
      expect(clientB._txStatus).to.be('I')

      // Client C: committed transaction (idle)
      await clientC.query('BEGIN')
      await clientC.query('COMMIT')
      expect(clientC._txStatus).to.be('I')

      clientA.release()
      clientB.release()
      clientC.release()

      // A was removed, B and C kept
      expect(pool.totalCount).to.be(2)
      expect(pool.idleCount).to.be(2)
      await pool.end()
    })

    describe('pool.query', function () {
      it('removes a client after pool.query leaks transaction via BEGIN', async function () {
        const logMessages = []
        const pool = new Pool({ max: 1, log: (msg) => logMessages.push(msg), evictOnOpenTransaction: true })

        await pool.query('BEGIN')

        // Client auto-released with txStatus='T', should be removed
        expect(pool.totalCount).to.be(0)
        expect(pool.idleCount).to.be(0)
        expect(logMessages).to.contain('remove client due to open transaction')

        // Verify pool recovers
        const { rows } = await pool.query('SELECT 1 as num')
        expect(rows[0].num).to.be(1)
        expect(pool.totalCount).to.be(1)
        expect(pool.idleCount).to.be(1)

        await pool.end()
      })

      it('removes a client after pool.query in failed transaction state', async function () {
        const pool = new Pool({ max: 1 })

        await pool.query('BEGIN')

        try {
          await pool.query('SELECT invalid_column FROM nonexistent_table')
        } catch (e) {
          // Expected error
        }

        // Client with txStatus='E' should be removed
        expect(pool.totalCount).to.be(0)
        expect(pool.idleCount).to.be(0)

        // Pool recovers
        const { rows } = await pool.query('SELECT 1 as num')
        expect(rows[0].num).to.be(1)
        expect(pool.totalCount).to.be(1)
        expect(pool.idleCount).to.be(1)

        await pool.end()
      })
    })
  })

  describe('when evictOnOpenTransaction is false or default', function () {
    it('keeps client with open transaction when explicitly false', async function () {
      const logMessages = []
      const pool = new Pool({
        max: 1,
        log: (msg) => logMessages.push(msg),
        evictOnOpenTransaction: false,
      })
      const client = await pool.connect()
      await client.query('BEGIN')
      expect(client._txStatus).to.be('T')

      client.release()
      expect(pool.totalCount).to.be(1) // NOT removed
      expect(pool.idleCount).to.be(1)
      expect(logMessages).to.not.contain('remove client due to open transaction')

      // Verify pool can still execute queries (connection was reused)
      const { rows } = await pool.query('SELECT 1 as num')
      expect(rows[0].num).to.be(1)

      await pool.end()
    })

    it('keeps client with open transaction when option not specified (default)', async function () {
      const logMessages = []
      const pool = new Pool({
        max: 1,
        log: (msg) => logMessages.push(msg),
      })
      const client = await pool.connect()
      await client.query('BEGIN')
      expect(client._txStatus).to.be('T')

      client.release()
      expect(pool.totalCount).to.be(1) // NOT removed
      expect(pool.idleCount).to.be(1)
      expect(logMessages).to.not.contain('remove client due to open transaction')

      // Verify pool can still execute queries (connection was reused)
      const { rows } = await pool.query('SELECT 1 as num')
      expect(rows[0].num).to.be(1)

      await pool.end()
    })

    it('keeps client in failed transaction state when explicitly false', async function () {
      const pool = new Pool({ max: 1, evictOnOpenTransaction: false })
      const client = await pool.connect()
      await client.query('BEGIN')
      try {
        await client.query('SELECT invalid_column FROM nonexistent_table')
      } catch (e) {
        // swallow the error
      }
      // Issue a follow-up query to ensure _txStatus is updated to 'E'
      try {
        await client.query('SELECT 1')
      } catch (e) {
        // expected — "current transaction is aborted"
      }
      expect(client._txStatus).to.be('E')

      client.release()
      expect(pool.totalCount).to.be(1) // NOT removed
      expect(pool.idleCount).to.be(1)

      // Get a new client and manually ROLLBACK the failed transaction
      const client2 = await pool.connect()
      await client2.query('ROLLBACK')
      const { rows } = await client2.query('SELECT 1 as num')
      expect(rows[0].num).to.be(1)
      client2.release()

      await pool.end()
    })

    it('keeps client in failed transaction state when option not specified (default)', async function () {
      const pool = new Pool({ max: 1 })
      const client = await pool.connect()
      await client.query('BEGIN')
      try {
        await client.query('SELECT invalid_column FROM nonexistent_table')
      } catch (e) {
        // swallow the error
      }
      // Issue a follow-up query to ensure _txStatus is updated to 'E'
      try {
        await client.query('SELECT 1')
      } catch (e) {
        // expected — "current transaction is aborted"
      }
      expect(client._txStatus).to.be('E')

      client.release()
      expect(pool.totalCount).to.be(1) // NOT removed
      expect(pool.idleCount).to.be(1)

      // Get a new client and manually ROLLBACK the failed transaction
      const client2 = await pool.connect()
      await client2.query('ROLLBACK')
      const { rows } = await client2.query('SELECT 1 as num')
      expect(rows[0].num).to.be(1)
      client2.release()

      await pool.end()
    })

    it('keeps all clients with mixed transaction states', async function () {
      const logMessages = []
      const pool = new Pool({
        max: 3,
        evictOnOpenTransaction: false,
        log: (msg) => logMessages.push(msg),
      })
      const clientA = await pool.connect()
      const clientB = await pool.connect()
      const clientC = await pool.connect()

      // Client A: open transaction (leaked)
      await clientA.query('BEGIN')
      expect(clientA._txStatus).to.be('T')

      // Client B: normal query (idle)
      await clientB.query('SELECT 1')
      expect(clientB._txStatus).to.be('I')

      // Client C: committed transaction (idle)
      await clientC.query('BEGIN')
      await clientC.query('COMMIT')
      expect(clientC._txStatus).to.be('I')

      clientA.release()
      clientB.release()
      clientC.release()

      // All clients kept in pool
      expect(pool.totalCount).to.be(3)
      expect(pool.idleCount).to.be(3)
      expect(logMessages).to.not.contain('remove client due to open transaction')

      await pool.end()
    })

    describe('pool.query', function () {
      it('keeps client after pool.query leaks transaction via BEGIN (default)', async function () {
        const logMessages = []
        const pool = new Pool({ max: 1, log: (msg) => logMessages.push(msg) })

        await pool.query('BEGIN')

        // Client auto-released with txStatus='T', should be kept
        expect(pool.totalCount).to.be(1) // NOT removed
        expect(pool.idleCount).to.be(1)
        expect(logMessages).to.not.contain('remove client due to open transaction')

        // Verify pool still works
        const { rows } = await pool.query('SELECT 1 as num')
        expect(rows[0].num).to.be(1)

        await pool.end()
      })

      it('removes client on pool.query error even when evictOnOpenTransaction is false', async function () {
        const pool = new Pool({ max: 1, evictOnOpenTransaction: false })

        await pool.query('BEGIN')

        try {
          await pool.query('SELECT invalid_column FROM nonexistent_table')
        } catch (e) {
          // Expected error - pool.query calls client.release(err) which removes the client
        }

        // Client is removed because pool.query releases with error argument
        // This is independent of evictOnOpenTransaction setting
        expect(pool.totalCount).to.be(0)
        expect(pool.idleCount).to.be(0)

        // Pool recovers with a fresh connection
        const { rows } = await pool.query('SELECT 1 as num')
        expect(rows[0].num).to.be(1)
        expect(pool.totalCount).to.be(1)
        expect(pool.idleCount).to.be(1)

        await pool.end()
      })
    })
  })
})
