import Pool from '../'
import assert from 'assert'

describe('pool ending', () => {
  it('ends without being used', (done) => {
    const pool = new Pool()
    pool.end(done)
  })

  it('ends with a promise', () => {
    return new Pool().end()
  })

  it('ends with clients', async () => {
    const pool = new Pool()
    const res = await pool.query('SELECT $1::text as name', ['brianc'])
    assert.strictEqual(res.rows[0].name, 'brianc')
    await pool.end()
  })

  it('allows client to finish', async () => {
    const pool = new Pool()
    const query = pool.query('SELECT $1::text as name', ['brianc'])
    await pool.end()
    const res = await query
    assert.strictEqual(res.rows[0].name, 'brianc')
  })
})
