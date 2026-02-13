import assert from 'assert'
import { Pool } from 'pg'
import QueryStream from '../src'

describe('pool', function () {
  it('works', async function () {
    const pool = new Pool()
    const query = new QueryStream('SELECT * FROM generate_series(0, 10) num', [])
    const q = pool.query(query)
    console.log(q) // Promise { <pending>, ...
    query.on('data', (row) => {
      // just consume the whole stream
    })
    await q //!
    query.on('end', () => {
      pool.end()
    })
  })
})
