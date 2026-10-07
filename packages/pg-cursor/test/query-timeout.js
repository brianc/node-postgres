'use strict'
const assert = require('assert')
const Cursor = require('../')
const pg = require('pg')

const text = 'SELECT generate_series as num FROM generate_series(0, 4)'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('cursor with query_timeout', function () {
  beforeEach(async function () {
    this.client = new pg.Client({ query_timeout: 100 })
    await this.client.connect()
  })

  afterEach(async function () {
    await this.client.end()
  })

  it('does not report a read timeout after the cursor is done', async function () {
    const calls = []
    const cursor = this.client.query(new Cursor(text), (err) => calls.push(err))
    const rows = await cursor.read(100)
    assert.equal(rows.length, 5)
    await cursor.close()
    await wait(200)
    assert.deepEqual(calls, [null])
  })

  it('does not report a read timeout after the cursor errored', async function () {
    const calls = []
    const cursor = this.client.query(new Cursor('SELECT 1 / 0'), (err) => calls.push(err))
    await assert.rejects(cursor.read(1), /division by zero/)
    await wait(200)
    assert.equal(calls.length, 1)
    assert.match(calls[0].message, /division by zero/)
  })
})
