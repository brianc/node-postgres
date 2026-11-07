'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const vm = require('vm')
const suite = new helper.Suite()

suite.test('ArrayBuffer parameters work with cached prepared queries', async function () {
  const client = new helper.pg.Client(helper.config)
  await client.connect()
  try {
    for (const bytes of [[], [65, 66, 67], [68, 69]]) {
      const value = Uint8Array.from(bytes).buffer
      const result = await client.query({
        name: 'arraybuffer-parameter',
        text: 'SELECT $1::bytea AS value',
        values: [value],
      })
      assert.deepStrictEqual(result.rows[0].value, Buffer.from(bytes))
    }
  } finally {
    await client.end()
  }
})

// libpq currently accepts scalar Buffer parameters as text, so arbitrary binary
// scalar parameters are only supported by the JavaScript client.
if (!helper.args.native) {
  suite.test('ArrayBuffer round-trips packed metadata and a floating-point payload', async function () {
    const client = new helper.pg.Client(helper.config)
    await client.connect()
    try {
      const value = new ArrayBuffer(12)
      new Uint8Array(value, 0, 4).set([0, 128, 255, 42])
      new Float32Array(value, 4).set([1.5, -2.5])
      await client.query('CREATE TEMP TABLE packed_data (value bytea)')
      await client.query('INSERT INTO packed_data VALUES ($1)', [value])
      const result = await client.query('SELECT value FROM packed_data')
      assert.deepStrictEqual(Array.from(result.rows[0].value), Array.from(new Uint8Array(value)))
    } finally {
      await client.end()
    }
  })

  suite.test('ArrayBuffer parameters preserve all bytes, cross-realm values and view bounds', async function () {
    const client = new helper.pg.Client(helper.config)
    await client.connect()
    try {
      const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
      const foreign = vm.runInNewContext('Uint8Array.from([0, 128, 255]).buffer')
      const cases = [
        [bytes.buffer, Buffer.from(bytes)],
        [foreign, Buffer.from([0, 128, 255])],
        [new DataView(bytes.buffer, 127, 3), Buffer.from([127, 128, 129])],
        [bytes.subarray(127, 130), Buffer.from([127, 128, 129])],
        [{ toPostgres: () => foreign }, Buffer.from([0, 128, 255])],
      ]
      for (const [value, expected] of cases) {
        const result = await client.query('SELECT $1::bytea AS value', [value])
        assert.deepStrictEqual(result.rows[0].value, expected)
      }
    } finally {
      await client.end()
    }
  })
}

suite.test('ArrayBuffer arrays round-trip binary values and nulls', async function () {
  const client = new helper.pg.Client(helper.config)
  await client.connect()
  try {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    const foreign = vm.runInNewContext('Uint8Array.from([0, 128, 255]).buffer')
    const value = [
      [bytes.buffer, new ArrayBuffer(0), null],
      [foreign, bytes.subarray(127, 130), new DataView(bytes.buffer, 254, 2)],
    ]
    const result = await client.query('SELECT $1::bytea[] AS value', [value])
    assert.deepStrictEqual(result.rows[0].value, [
      [Buffer.from(bytes), Buffer.alloc(0), null],
      [Buffer.from([0, 128, 255]), Buffer.from([127, 128, 129]), Buffer.from([254, 255])],
    ])
  } finally {
    await client.end()
  }
})
