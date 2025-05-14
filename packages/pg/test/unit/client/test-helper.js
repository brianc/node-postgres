'use strict'
const helper = require('../test-helper')
const Connection = require('../../../lib/connection')
const { Client } = helper

const makeClient = function () {
  const connection = new Connection({ stream: 'no' })
  connection.startup = function () {}
  connection.connect = function () {}
  connection.query = function (text) {
    this.queries.push(text)
  }
  connection.queries = []
  const client = new Client({ connection: connection })
  client.connect()
  client.connection.emit('connect')
  return client
}

module.exports = Object.assign(
  {
    client: makeClient,
  },
  helper
)
