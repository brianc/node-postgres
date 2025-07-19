import { describe, it, before, beforeEach, after } from 'node:test'
import { strict as assert } from 'assert'
import { Client, Pool } from 'pg'
import { transaction } from './index.js'

const withClient = async (cb: (client: Client) => Promise<void>): Promise<void> => {
  const client = new Client()
  await client.connect()
  try {
    await cb(client)
  } finally {
    await client.end()
  }
}

describe('Transaction', () => {
  before(async () => {
    // Ensure the test table is created before running tests
    await withClient(async (client) => {
      await client.query('CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY, name TEXT)')
    })
  })

  beforeEach(async () => {
    await withClient(async (client) => {
      await client.query('TRUNCATE test_table')
    })
  })

  after(async () => {
    // Clean up the test table after running tests
    await withClient(async (client) => {
      await client.query('DROP TABLE IF EXISTS test_table')
    })
  })

  it('should create a client with an empty temp table', async () => {
    await withClient(async (client) => {
      const { rowCount } = await client.query('SELECT * FROM test_table')
      assert.equal(rowCount, 0, 'Temp table should be empty on creation')
    })
  })

  it('should auto-commit at end of callback', async () => {
    await withClient(async (client) => {
      await transaction(client, async (client) => {
        await client.query('INSERT INTO test_table (name) VALUES ($1)', ['AutoCommit'])
        // row should be visible within transaction
        const { rows } = await client.query('SELECT * FROM test_table')
        assert.equal(rows.length, 1, 'Row should be inserted within transaction')

        // while inside this transaction, the changes are not visible outside
        await withClient(async (innerClient) => {
          const { rowCount } = await innerClient.query('SELECT * FROM test_table')
          assert.equal(rowCount, 0, 'Temp table should still be empty inside transaction')
        })

        // now that the transaction is committed, the changes are visible outside
        await withClient(async (innerClient) => {
          const { rowCount } = await innerClient.query('SELECT * FROM test_table')
          assert.equal(rowCount, 1, 'Row should be inserted after transaction commits')
        })
      })
    })
  })

  it('should rollback on error', async () => {
    await withClient(async (client) => {
      try {
        await transaction(client, async (client) => {
          await client.query('INSERT INTO test_table (name) VALUES ($1)', ['RollbackTest'])
          throw new Error('Intentional Error to trigger rollback')
        })
      } catch (error) {
        // Expected error, do nothing
      }

      // After rollback, the table should still be empty
      const { rowCount } = await client.query('SELECT * FROM test_table')
      assert.equal(rowCount, 0, 'Temp table should be empty after rollback')
    })
  })

  it('works with Pool', async () => {
    const pool = new Pool()
    try {
      await transaction(pool, async (client) => {
        await client.query('INSERT INTO test_table (name) VALUES ($1)', ['PoolTransaction'])
        const { rows } = await client.query('SELECT * FROM test_table')
        assert.equal(rows.length, 1, 'Row should be inserted in pool transaction')
      })

      assert.equal(pool.idleCount, 1, 'Pool should have idle clients after transaction')

      // Verify the row is visible outside the transaction
      const { rows } = await pool.query('SELECT * FROM test_table')
      assert.equal(rows.length, 1, 'Row should be visible after pool transaction')
    } finally {
      await pool.end()
    }
  })

  it('rollsback errors with pool', async () => {
    const pool = new Pool()
    try {
      try {
        await transaction(pool, async (client) => {
          await client.query('INSERT INTO test_table (name) VALUES ($1)', ['PoolRollbackTest'])
          throw new Error('Intentional Error to trigger rollback')
        })
      } catch (error) {
        // Expected error, do nothing
      }

      // After rollback, the table should still be empty
      const { rowCount } = await pool.query('SELECT * FROM test_table')
      assert.equal(rowCount, 0, 'Temp table should be empty after pool rollback')
    } finally {
      await pool.end()
    }
  })

  it('can be bound to first argument', async () => {
    const pool = new Pool()
    try {
      const txn = transaction.bind(null, pool)

      await txn(async (client) => {
        await client.query('INSERT INTO test_table (name) VALUES ($1)', ['BoundTransaction'])
        const { rows } = await client.query('SELECT * FROM test_table')
        assert.equal(rows.length, 1, 'Row should be inserted in bound transaction')
      })

      // Verify the row is visible outside the transaction
      const { rows } = await pool.query('SELECT * FROM test_table')
      assert.equal(rows.length, 1, 'Row should be visible after bound transaction')
    } finally {
      await pool.end()
    }
  })

  it('can return something from the transaction callback', async () => {
    const pool = new Pool()
    const result = await transaction(pool, async (client) => {
      await client.query('INSERT INTO test_table (name) VALUES ($1)', ['ReturnValueTest'])
      return 'Transaction Result'
    })

    assert.equal(result, 'Transaction Result', 'Should return value from transaction callback')

    // Verify the row is visible outside the transaction
    const { rows } = await pool.query('SELECT * FROM test_table')
    assert.equal(rows.length, 1, 'Row should be visible after transaction with return value')
    pool.end()
  })
})
