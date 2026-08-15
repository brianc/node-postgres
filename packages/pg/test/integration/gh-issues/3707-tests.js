'use strict'
const helper = require('./../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

suite.test('recovers after an error in a rows-limited query', async function () {
  const client = new helper.pg.Client()

  await client.connect()

  try {
    const error = await client
      .query({
        text: 'select 10 / (5 - i) as v from generate_series(1, 7) g(i)',
        rows: 2,
      })
      .catch((err) => err)

    assert.strictEqual(error.code, '22012')

    const followUp = client.query('select 1').then(
      () => 'follow-up resolved',
      (err) => `follow-up rejected: ${err.message}`
    )
    let timeout
    const hung = new Promise((resolve) => {
      timeout = setTimeout(resolve, 4000, 'follow-up hung')
    })

    const result = await Promise.race([followUp, hung])
    clearTimeout(timeout)

    assert.strictEqual(result, 'follow-up resolved')
  } finally {
    await client.end()
  }
})
