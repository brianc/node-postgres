const helper = require('../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

suite.testAsync('binary format mode parses integers correctly', async () => {
  const client = new helper.pg.Client()
  await client.connect()

  const r1 = await client.query({
    text: 'SELECT 1::int as a, 1000::int as b, $1::int as c',
    values: [3000],
    binary: false,
  })
  assert.deepEqual([1, 1000, 3000], [r1.rows[0].a, r1.rows[0].b, r1.rows[0].c])

  const r2 = await client.query({
    text: 'SELECT 1::int as a, 1000::int as b, $1::int as c',
    values: [3000],
    binary: true,
  })
  assert.deepEqual([1, 1000, 3000], [r2.rows[0].a, r2.rows[0].b, r2.rows[0].c])

  await client.end()
})
