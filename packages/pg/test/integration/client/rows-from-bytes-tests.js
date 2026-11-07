'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const Result = require('../../../lib/result')

const pg = helper.pg
const suite = new helper.Suite()

const query = `
  select 7::int a, (-2147483648)::int b, (-32768)::int2 c, 4294967295::oid d,
    true e, false f, 'è€😀'::text g, ''::text h, 'x'::varchar i, null::int j, 1.5::float8 k`

const expected = {
  a: 7,
  b: -2147483648,
  c: -32768,
  d: 4294967295,
  e: true,
  f: false,
  g: 'è€😀',
  h: '',
  i: 'x',
  j: null,
  k: 1.5,
}

// Without this the rows are correct but go through parseRow, and the shortcut is dead code.
const countParseRow = async (fn) => {
  const parseRow = Result.prototype.parseRow
  let calls = 0
  Result.prototype.parseRow = function (rowData) {
    calls++
    return parseRow.call(this, rowData)
  }
  try {
    await fn()
  } finally {
    Result.prototype.parseRow = parseRow
  }
  return calls
}

suite.test('a client reads the rows of a query from the bytes', async function () {
  if (helper.args.native || pg.defaults.binary) {
    return
  }
  const client = new pg.Client()
  await client.connect()
  try {
    const calls = await countParseRow(async () => {
      assert.deepStrictEqual((await client.query(query)).rows, [expected])
      assert.deepStrictEqual((await client.query({ text: query, name: 'bytes' })).rows, [expected])
    })
    assert.strictEqual(calls, 0)
  } finally {
    await client.end()
  }
})

suite.test('a pooled client reads the rows of a query from the bytes', async function () {
  if (helper.args.native || pg.defaults.binary) {
    return
  }
  const pool = new pg.Pool()
  try {
    const calls = await countParseRow(async () => {
      assert.deepStrictEqual((await pool.query(query)).rows, [expected])
    })
    assert.strictEqual(calls, 0)
  } finally {
    await pool.end()
  }
})
