'use strict'
var helper = require('./../test-helper')
const suite = new helper.Suite()

suite.test('Closing an unconnected client calls callback', (done) => {
  const client = new helper.pg.Client()
  client.end(done)
})

suite.testAsync('Closing an unconnected client resolves promise', () => {
  const client = new helper.pg.Client()
  return client.end()
})
