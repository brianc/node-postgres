'use strict'
var helper = require('./test-helper')
var Query = helper.pg.Query

// before running this test make sure you run the script create-test-tables
test('simple query interface', function () {
  var client = helper.client()
  client.on('drain', client.end.bind(client))

  var query3 = client.query(new Query('select pg_sleep(3) as sleep3'))
  query3.on('row', function (row, result) {
    assert(true)
  })

  var query5 = client.query(new Query('select pg_sleep(5) as sleep5'))
  client.cancel(query5);
  query5.on('row', function (row, result) {
    assert(false)
  })

  var query7 = client.query(new Query('select pg_sleep(7) as sleep7'))
  client.cancel(query7);
  query7.on('row', function (row, result) {
    assert(false)
  })
})
