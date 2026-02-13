const helper = require('../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

suite.test('allows you to switch between format modes for arrays', async () => {
  const client = new helper.pg.Client()
  await client.connect()

  const r1 = await client.query({
    text: 'SELECT CAST($1 AS INT[]) as a',
    values: [[1, 2, 8]],
    binary: false,
  })
  assert.deepEqual([1, 2, 8], r1.rows[0].a)

  const r2 = await client.query({
    text: 'SELECT CAST($1 AS INT[]) as a',
    values: [[4, 5, 6]],
    binary: true,
  })
  assert.deepEqual([4, 5, 6], r2.rows[0].a)

  await client.end()
})
