'use strict'
const helper = require('../test-helper')
const Client = require('../../lib/native')
const Query = Client.Query
const assert = require('assert')
const suite = new helper.Suite()

suite.test('many rows', function () {
  const client = new Client(helper.config)
  client.connect()
  const q = client.query(new Query('SELECT * FROM person'))
  const rows = []
  q.on('row', function (row) {
    rows.push(row)
  })
  assert.emits(q, 'end', function () {
    client.end()
    assert.lengthIs(rows, 26)
  })
})

suite.test('many queries', function () {
  const client = new Client(helper.config)
  client.connect()
  let count = 0
  const expected = 100
  for (let i = 0; i < expected; i++) {
    const q = client.query(new Query('SELECT * FROM person'))
    assert.emits(q, 'end', function () {
      count++
    })
  }
  assert.emits(client, 'drain', function () {
    client.end()
    assert.equal(count, expected)
  })
})

suite.test('many clients', function () {
  const clients = []
  for (let i = 0; i < 10; i++) {
    clients.push(new Client(helper.config))
  }
  clients.forEach(function (client) {
    client.connect()
    for (let i = 0; i < 20; i++) {
      client.query('SELECT * FROM person')
    }
    assert.emits(client, 'drain', function () {
      client.end()
    })
  })
})
