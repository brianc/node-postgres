'use strict'

const helper = require('./test-helper')
const pg = helper.pg
const assert = require('assert')

const suite = new helper.Suite()

suite.test('valid connection completes promise', () => {
  const client = new pg.Client()
  return client.connect().then(() => {
    return client.end().then(() => {})
  })
})

suite.test('valid connection returns the client in a promise', () => {
  const client = new pg.Client()
  return client.connect().then((clientInside) => {
    assert.equal(client, clientInside)
    return client.end().then(() => {})
  })
})

suite.test('invalid connection rejects promise', async () => {
  const client = new pg.Client({ host: 'alksdjflaskdfj', port: 1234 })
  await assert.rejects(client.connect(), Error)
})
