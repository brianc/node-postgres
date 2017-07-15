'use strict'
var pg = require(__dirname + '/../lib')
var args = require(__dirname + '/../test/cli')

var queries = [
  'select CURRENT_TIMESTAMP',
  "select interval '1 day' + interval '1 hour'",
  "select TIMESTAMP 'today'"]

queries.forEach(function (query) {
  var client = new pg.Client({
    user: args.user,
    database: args.database,
    password: args.password
  })
  client.connect()
  client
    .query(query)
    .on('row', function (row) {
      console.log(row)
      client.end()
    })
})
