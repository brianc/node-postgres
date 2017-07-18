'use strict'
var helper = require('./test-helper')
const suite = new helper.Suite()

suite.test('empty query message handling', function (done) {
  const client = helper.client()
  assert.emits(client, 'drain', function () {
    client.end(done)
  })
  client.query({text: ''})
})

suite.test('callback supported', function (done) {
  const client = helper.client()
  client.query('', function (err, result) {
    assert(!err)
    assert.empty(result.rows)
    client.end(done)
  })
})
