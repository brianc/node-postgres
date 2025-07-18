import { strict as assert } from 'assert'
import { Client } from 'pg'
import { transaction } from '.'

class DisposableClient extends Client {
  // overwrite the query method and log the arguments and then dispatch to the original method
  override query(...args: any[]): any {
    // console.log('Executing query:', ...args);
    // @ts-ignore
    return super.query(...args)
  }

  async [Symbol.asyncDispose]() {
    await this.end()
  }
}

async function getClient(): Promise<DisposableClient> {
  const client = new DisposableClient()
  await client.connect()
  await client.query('CREATE TEMP TABLE test_table (id SERIAL PRIMARY KEY, name TEXT)')
  return client
}

describe('transaction', () => {
  it('should create a client with an empty temp table', async () => {
    await using client = await getClient()
    const { rowCount } = await client.query('SELECT * FROM test_table')
    assert.equal(rowCount, 0, 'Temp table should be empty on creation')
  })

  it('automatically commits on success', async () => {
    await using client = await getClient()

    const result = await transaction(client, async () => {
      await client.query('INSERT INTO test_table (name) VALUES ($1)', ['test'])
      const { rows } = await client.query('SELECT * FROM test_table')
      return rows[0].name // Should return 'test'
    })

    assert.equal(result, 'test')
  })

  it('automatically rolls back on error', async () => {
    await using client = await getClient()

    // Assert that the transaction function rejects with the expected error
    await assert.rejects(
      async () => {
        await transaction(client, async () => {
          await client.query('INSERT INTO test_table (name) VALUES ($1)', ['test'])
          await client.query('SELECT * FROM test_table')
          throw new Error('Simulated error') // This will trigger a rollback
        })
      },
      {
        name: 'Error',
        message: 'Simulated error',
      }
    )

    // Verify that the transaction rolled back
    const { rowCount } = await client.query('SELECT * FROM test_table')
    assert.equal(rowCount, 0, 'Table should be empty after rollback')
  })

  it('can return nothing from the transaction with correct type', async () => {
    await using client = await getClient()

    const _: void = await transaction(client, async () => {
      await client.query('INSERT INTO test_table (name) VALUES ($1)', ['test'])
    })
  })
})
