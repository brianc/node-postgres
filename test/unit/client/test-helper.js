'use strict'
var helper = require('../test-helper')
var Connection = require('../../../lib/connection')

var makeClient = function () {
  var connection = new Connection({stream: 'no'})
  connection.startup = function () {}
  connection.connect = function () {}
  connection.query = function (text) {
    this.queries.push(text)
  }
  connection.queries = []
  var client = new Client({connection: connection})
  client.connect()
  client.connection.emit('connect')
  return client
}

module.exports = Object.assign({
  client: makeClient
}, helper)
