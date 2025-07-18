import type { Client, Pool, PoolClient } from 'pg'

function isPoolClient(clientOrPool: Client | PoolClient): clientOrPool is PoolClient {
  return 'release' in clientOrPool
}

function isPool(clientOrPool: Client | Pool): clientOrPool is Pool {
  return 'idleCount' in clientOrPool
}

async function transaction<T>(clientOrPool: Client | Pool, cb: (client: Client) => Promise<T>): Promise<T> {
  let client: Client | PoolClient
  if (isPool(clientOrPool)) {
    // It's a Pool
    client = await clientOrPool.connect()
  } else {
    // It's a Client
    client = clientOrPool as Client
  }
  await client.query('BEGIN')
  try {
    const result = await cb(client as Client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    if (isPoolClient(client)) {
      client.release()
    }
  }
}

export { transaction }
