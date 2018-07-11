'use strict'
var helper = require(__dirname + '/test-helper')

test('parseComplete does not fail on null activeQuery', function () {
  var client = helper.client()
  client._attachListeners(client.connection)
  client.activeQuery = null
  client.connection.emit('parseComplete')
})
