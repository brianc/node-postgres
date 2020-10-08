const pg = require('../../../lib')
const helper = require('../test-helper')
const suite = new helper.Suite()

suite.testAsync('timeout causing query crashes', async () => {
  const client = new helper.Client()
  await client.connect()
  await client.query('CREATE TEMP TABLE foobar( name TEXT NOT NULL, id SERIAL)')
  await client.query('BEGIN')
  await client.query("SET LOCAL statement_timeout TO '1ms'")
  let count = 0
  while (count++ < 5000) {
    try {
      await client.query('INSERT INTO foobar(name) VALUES ($1)', [Math.random() * 1000 + ''])
    } catch (e) {
      await client.query('ROLLBACK')
    }
  }
  await client.end()
})
