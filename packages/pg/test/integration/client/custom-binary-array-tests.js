'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()

suite.test('custom binary array elements round-trip through bytea arrays', async function () {
  const client = new helper.pg.Client(helper.config)
  await client.connect()
  try {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    const cases = [
      [Buffer.from(bytes), Buffer.from(bytes)],
      [Buffer.alloc(0), Buffer.alloc(0)],
      [bytes.subarray(127, 130), Buffer.from([127, 128, 129])],
      [new DataView(bytes.buffer, 254, 2), Buffer.from([254, 255])],
    ]
    for (const [value, expected] of cases) {
      let calls = 0
      const customType = {
        toPostgres: function () {
          calls++
          return value
        },
      }
      const result = await client.query('SELECT $1::bytea[] AS value', [[customType, value, null]])
      assert.deepStrictEqual(result.rows[0].value, [expected, expected, null])
      assert.strictEqual(calls, 1)
    }
  } finally {
    await client.end()
  }
})

suite.test('chained custom binary elements round-trip through nested bytea arrays', async function () {
  const client = new helper.pg.Client(helper.config)
  await client.connect()
  try {
    const bytes = Buffer.from([0, 128, 255])
    const customType = { toPostgres: () => ({ toPostgres: () => bytes }) }
    const result = await client.query('SELECT $1::bytea[] AS value', [[[customType], [bytes]]])
    assert.deepStrictEqual(result.rows[0].value, [[bytes], [bytes]])
  } finally {
    await client.end()
  }
})
