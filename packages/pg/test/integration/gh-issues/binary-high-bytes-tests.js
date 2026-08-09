'use strict'
const helper = require('../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

// Binary results used to be decoded as utf-8 by pg-protocol's BufferReader and then re-encoded by
// Result#parseRow with Buffer.from(). Any byte >= 0x80 does not survive that round trip: it is not
// valid utf-8 on its own, so it became U+FFFD (0xEF 0xBF 0xBD) and the original value was lost.
//
// The corruption started exactly at 0x80, which is why it went unnoticed: every value used by the
// existing binary tests happens to be built from bytes below that threshold.
//
//   SELECT 127::int -> 127          (0x0000007F, all bytes < 0x80)
//   SELECT 128::int -> 239          (0x00000080, corrupted)
//   SELECT 200::int -> 239          (0x000000C8, corrupted)
//   SELECT -1::int  -> -272646673   (0xFFFFFFFF, corrupted)
suite.test('binary results survive bytes >= 0x80', async () => {
  const client = new helper.pg.Client()
  await client.connect()

  for (const value of [0, 1, 127, 128, 200, 255, 256, 65535, 2147483647, -1, -128, -2147483648]) {
    const { rows } = await client.query({ text: 'SELECT $1::int AS a', values: [value], binary: true })
    assert.strictEqual(rows[0].a, value, `binary int ${value} round tripped as ${rows[0].a}`)
  }

  await client.end()
})

suite.test('binary results preserve multi-byte text', async () => {
  const client = new helper.pg.Client()
  await client.connect()

  for (const value of ['wat', 'ciào €', '日本語', '🐘']) {
    const { rows } = await client.query({ text: 'SELECT $1::text AS a', values: [value], binary: true })
    assert.strictEqual(rows[0].a, value)
  }

  await client.end()
})

// Text mode is the default and must be untouched by the format-aware decoding.
suite.test('text mode is unaffected', async () => {
  const client = new helper.pg.Client()
  await client.connect()

  const { rows } = await client.query("SELECT 200::int AS a, 'ciào €'::text AS b, true AS c, NULL::int AS d")
  assert.deepStrictEqual(rows[0], { a: 200, b: 'ciào €', c: true, d: null })

  await client.end()
})
