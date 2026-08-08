'use strict'
const helper = require('../test-helper')
const Connection = require('../../../lib/connection')
const { Client } = helper

const makeClient = function (config) {
  const connection = new Connection({ stream: 'no' })
  connection.startup = function () {}
  connection.connect = function () {}
  connection.query = function (text) {
    this.queries.push(text)
  }
  connection.parse = function (msg) {
    this.parseMessages.push(msg)
  }
  connection.bind = function (msg) {
    this.bindMessages.push(msg)
  }
  connection.describe = function (msg) {}
  connection.execute = function (msg) {}
  connection.sync = function () {
    this.syncCount++
  }
  connection.flush = function () {}
  connection.queries = []
  connection.parseMessages = []
  connection.bindMessages = []
  connection.syncCount = 0
  const client = new Client({ connection: connection, ...config })
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
