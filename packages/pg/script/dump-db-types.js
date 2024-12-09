'use strict'
const pg = require('../lib')
const args = require('../test/cli')

const queries = ['select CURRENT_TIMESTAMP', "select interval '1 day' + interval '1 hour'", "select TIMESTAMP 'today'"]

queries.forEach(function (query) {
  const client = new pg.Client({
    user: args.user,
    database: args.database,
    password: args.password,
  })
  client.connect()
  client.query(query).on('row', function (row) {
    console.log(row)
    client.end()
  })
})
