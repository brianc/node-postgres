const assert = require('assert')
const Cursor = require('../')
const pg = require('pg')

describe('transactions', () => {
  it('can execute multiple statements in a transaction', async () => {
    const client = new pg.Client()
    await client.connect()
    await client.query('begin')
    await client.query('CREATE TEMP TABLE foobar(id SERIAL PRIMARY KEY)')
    const cursor = client.query(new Cursor('SELECT * FROM foobar'))
    const rows = await new Promise((resolve, reject) => {
      cursor.read(10, (err, rows) => (err ? reject(err) : resolve(rows)))
    })
    assert.equal(rows.length, 0)
    await client.query('ALTER TABLE foobar ADD COLUMN name TEXT')
    await client.end()
  })

  it('can execute multiple statements in a transaction if ending cursor early', async () => {
    const client = new pg.Client()
    await client.connect()
    await client.query('begin')
    await client.query('CREATE TEMP TABLE foobar(id SERIAL PRIMARY KEY)')
    const cursor = client.query(new Cursor('SELECT * FROM foobar'))
    await new Promise(resolve => cursor.close(resolve))
    await client.query('ALTER TABLE foobar ADD COLUMN name TEXT')
    await client.end()
  })
})
