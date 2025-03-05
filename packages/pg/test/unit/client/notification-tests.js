'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()

suite.test('passes connection notification', function () {
  const client = helper.client()
  assert.emits(client, 'notice', function (msg) {
    assert.equal(msg, 'HAY!!')
  })
  client.connection.emit('notice', 'HAY!!')
})
