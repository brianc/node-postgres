import { QueryResult } from "pg"
import Result from "pg/lib/result"

const assert = require('assert')
const BatchQuery = require('../')
const pg = require('pg')

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
    console.log(responses)
    for ( const response of responses) {
      assert.strictEqual(response.rowCount, 1)
    }
  })
})
