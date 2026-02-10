'use strict'

const expect = require('expect.js')
const describe = require('mocha').describe
const it = require('mocha').it
const Pool = require('..')

describe('leaked connection pool guard', function () {
  it('removes a client with an open transaction on release', async function () {
    const logMessages = []
    const pool = new Pool({
      max: 1,
      log: (msg) => logMessages.push(msg),
    })
    const client = await pool.connect()
    await client.query('BEGIN')
    expect(client._txStatus).to.be('T')

    client.release()
    expect(pool.totalCount).to.be(0)
    expect(pool.idleCount).to.be(0)
    expect(logMessages).to.contain('remove client with leaked transaction')

    // pool recovers by creating a fresh connection
    const { rows } = await pool.query('SELECT 1 as num')
    expect(rows[0].num).to.be(1)
    expect(pool.totalCount).to.be(1)
    expect(pool.idleCount).to.be(1)

    await pool.end()
  })

  it('removes a client in a failed transaction state on release', async function () {
    const pool = new Pool({ max: 1 })
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
    const pool = new Pool({ max: 3 })
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
      const pool = new Pool({ max: 1, log: (msg) => logMessages.push(msg) })

      await pool.query('BEGIN')

      // Client auto-released with txStatus='T', should be removed
      expect(pool.totalCount).to.be(0)
      expect(pool.idleCount).to.be(0)
      expect(logMessages).to.contain('remove client with leaked transaction')

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
