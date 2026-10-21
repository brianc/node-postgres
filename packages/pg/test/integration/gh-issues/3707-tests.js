const helper = require('../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

// the rows option drives the portal with flush instead of sync, which the native client does not do
if (helper.args.native) {
  return
}

suite.test('an error during a rows-limited query does not wedge the connection', async () => {
  const client = new helper.pg.Client()
  await client.connect()

  await assert.rejects(
    client.query({
      text: 'select 10 / (5 - i) as v from generate_series(1, 7) g(i)',
      rows: 2,
    }),
    /division by zero/
  )

  const { rows } = await client.query('select 1 as v')
  assert.equal(rows[0].v, 1)

  await client.end()
})
