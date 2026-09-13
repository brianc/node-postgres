'use strict'
const helper = require('./test-helper')
const suite = new helper.Suite()
const assert = require('assert')

suite.test('empty query message handling', function (done) {
  const client = helper.client()
  assert.emits(client, 'drain', function () {
    client.end(done)
  })
  client.query({ text: '' })
})

suite.test('callback supported', function (done) {
  const client = helper.client()
  client.query('', function (err, result) {
    assert(!err)
    assert.empty(result.rows)
    client.end(done)
  })
})

// the name was recorded as parsed with its empty text, and then read as not parsed at all,
// so the second run prepared it again and the server refused the duplicate
suite.test('a named empty statement can run more than once', async function () {
  const client = helper.client()
  try {
    for (let i = 0; i < 2; i++) {
      const result = await client.query({ text: '', name: 'empty' })
      assert.empty(result.rows)
    }
  } finally {
    await client.end()
  }
})
