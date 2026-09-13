'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()

const Client = helper.Client

// a binary value is bytes, and any byte utf8 cannot carry used to be lost between the parser
// and the type parsers: 1000 came back as 1007
suite.test('binary results keep every byte of a value', async function () {
  const client = new Client(helper.config)
  await client.connect()
  try {
    const result = await client.query({
      text: 'SELECT $1::int4 AS n, $2::float8 AS f, $3::text AS t',
      values: [1000, -2.5, 'é'],
      binary: true,
    })
    assert.strictEqual(result.rows[0].n, 1000)
    assert.strictEqual(result.rows[0].f, -2.5)
    assert.strictEqual(result.rows[0].t, 'é')
  } finally {
    await client.end()
  }
})
