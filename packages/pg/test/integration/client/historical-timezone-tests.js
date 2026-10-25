'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()

const cases = [
  ['Europe/Paris', '1890-01-01T12:00:00.123Z'],
  ['America/New_York', '1880-01-01T12:00:00.123Z'],
  ['Africa/Monrovia', '1970-01-01T00:00:00.000Z'],
]

for (const [zone, iso] of cases) {
  suite.test(`historical timestamptz round trip in ${zone}`, async function () {
    const oldTz = process.env.TZ
    const client = new helper.pg.Client(helper.config)
    try {
      process.env.TZ = zone
      await client.connect()
      const date = new Date(iso)
      const { rows } = await client.query(
        'SELECT $1::timestamptz AS val, $2::timestamptz AS control, $3::timestamptz[] AS vals',
        [date, iso, [date, date]]
      )
      assert.strictEqual(rows[0].control.getTime(), date.getTime())
      assert.strictEqual(rows[0].val.getTime(), date.getTime())
      assert.deepStrictEqual(
        rows[0].vals.map((value) => value.getTime()),
        [date.getTime(), date.getTime()]
      )
    } finally {
      await client.end()
      if (oldTz === undefined) delete process.env.TZ
      else process.env.TZ = oldTz
    }
  })
}

suite.test('historical Date keeps local fields for timestamp and date parameters', async function () {
  const oldTz = process.env.TZ
  const client = new helper.pg.Client(helper.config)
  try {
    process.env.TZ = 'Europe/Paris'
    await client.connect()
    const date = new Date('1890-01-01T12:00:00.123Z')
    const { rows } = await client.query(
      "SELECT to_char($1::timestamp, 'YYYY-MM-DD HH24:MI:SS.MS') AS val, $2::date::text AS day",
      [date, date]
    )
    assert.strictEqual(rows[0].val, '1890-01-01 12:09:21.123')
    assert.strictEqual(rows[0].day, '1890-01-01')
  } finally {
    await client.end()
    if (oldTz === undefined) delete process.env.TZ
    else process.env.TZ = oldTz
  }
})
