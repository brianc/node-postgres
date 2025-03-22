import assert from 'assert'
import BatchQuery from '../src'
import pg from 'pg'

describe('batch query', function () {
  beforeEach(async function () {
    const client = (this.client = new pg.Client())
    await client.connect()
    await client.query('CREATE TEMP TABLE foo(name TEXT, id SERIAL PRIMARY KEY)')
  })

  afterEach(function () {
    this.client.end()
  })

  it('batch insert works', async function () {
    await this.client.query(new BatchQuery({
        text: 'INSERT INTO foo (name) VALUES ($1)',
        values: [
            ['first'],
            ['second']
        ]
    })).execute()
    const resp = await this.client.query('SELECT COUNT(*) from foo')
    assert.strictEqual(resp.rows[0]['count'], '2')
  })

  it('batch select works', async function () {
    await this.client.query('INSERT INTO foo (name) VALUES ($1)', ['first'])
    await this.client.query('INSERT INTO foo (name) VALUES ($1)', ['second'])
    const responses = await this.client.query(new BatchQuery({
        text: 'SELECT * from foo where name = $1',
        values: [
            ['first'],
            ['second']
        ],
        name: 'optional'
    })).execute()
    for ( const response of responses) {
      assert.strictEqual(response.rowCount, 1)
    }
  })

  it('batch insert with non string values', async function () {
    await this.client.query('CREATE TEMP TABLE bar(value INT, id SERIAL PRIMARY KEY)')
    const batchInsert = new BatchQuery({
        text: 'INSERT INTO bar (value) VALUES ($1)',
        values: [
            ['1'],
            ['2']
        ]
    })
    await this.client.query(batchInsert).execute()
    const resp = await this.client.query('SELECT SUM(value) from bar')
    assert.strictEqual(resp.rows[0]['sum'], '3')
  })

  it('If query is for an array', async function() {
    await this.client.query('INSERT INTO foo (name) VALUES ($1)', ['first'])
    await this.client.query('INSERT INTO foo (name) VALUES ($1)', ['second'])
    const responses = await this.client.query(new BatchQuery({
      text: `SELECT * from foo where name = ANY($1)`,
      values: [
          [['first', 'third']],
          [['second', 'fourth']]
      ],
      name: 'optional'
  })).execute()
  assert.equal(responses.length, 2)
  for ( const response of responses) {
    assert.strictEqual(response.rowCount, 1)
  }})
})
