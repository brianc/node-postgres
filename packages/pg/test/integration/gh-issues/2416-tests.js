const helper = require('../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

suite.testAsync('it sets search_path on connection', async () => {
  const client = new helper.pg.Client({
    options: '--search_path=foo',
  })
  await client.connect()
  const { rows } = await client.query('SHOW search_path')
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].search_path, 'foo')
  await client.end()
})
