import assert from 'assert'
import BatchQuery from '../src'
import pg from 'pg'

describe('batch pool query', function () {
  beforeEach(async function () {
    this.pool = new pg.Pool({ max: 1 })
  })

  afterEach(function () {
    this.pool.end()
  })

  it('batch insert works', async function () {
    const batchQueryPromise = new BatchQuery({
        text: 'INSERT INTO foo (name) VALUES ($1)',
        values: [
            ['first'],
            ['second']
        ]
    })
    this.pool.connect(async (err, client, done) => {
      if (err) throw err
      await client.query('CREATE TEMP TABLE foo(name TEXT, id SERIAL PRIMARY KEY)')
      await client.query(batchQueryPromise).execute()
      const resp = await client.query('SELECT COUNT(*) from foo')
      await client.release()
      assert.strictEqual(resp.rows[0]['count'], '2')
    })
    
  })

  it('batch select works', async function () {
    const batchQueryPromise = new BatchQuery({
      text: 'SELECT * from foo where name = $1',
      values: [
          ['first'],
          ['second']
        ],
      name: 'optional'
    })
    this.pool.connect(async (err, client, done) => {
      if (err) throw err
      await client.query('CREATE TEMP TABLE foo(name TEXT, id SERIAL PRIMARY KEY)')
      await client.query('INSERT INTO foo (name) VALUES ($1)', ['first'])
      await client.query('INSERT INTO foo (name) VALUES ($1)', ['second'])
      const responses = await client.query(batchQueryPromise).execute()
      await client.release()
      for ( const response of responses) {
        assert.strictEqual(response.rowCount, 1)
      }
    })
  })
})
