'use strict'
const helper = require('./test-helper')
const Query = require('../../../lib/query')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('pipeline: concurrent queries with same statement name send only one PARSE', function () {
  const client = helper.client()
  client._pipelineMode = true
  client._connected = true

  const con = client.connection
  const parseCommands = []
  const bindCommands = []

  con.parse = function (arg) {
    parseCommands.push(arg)
  }
  con.bind = function (arg) {
    bindCommands.push(arg)
  }
  con.describe = function () {}
  con.execute = function () {}
  con.sync = function () {}
  con.flush = function () {}
  con.stream = { cork: function () {}, uncork: function () {} }

  const statementName = 'myStmt'
  const queryText = 'SELECT * FROM users WHERE id = $1'

  // Submit 3 queries with SAME name before any ParseComplete arrives
  client.query(new Query({ name: statementName, text: queryText, values: [1] }))
  client.query(new Query({ name: statementName, text: queryText, values: [2] }))
  client.query(new Query({ name: statementName, text: queryText, values: [3] }))

  // Only ONE PARSE should be sent (race condition prevention)
  assert.equal(parseCommands.length, 1, 'Expected 1 PARSE but got ' + parseCommands.length)
  assert.equal(parseCommands[0].name, statementName)

  // All 3 queries should have BIND commands
  assert.equal(bindCommands.length, 3, 'Expected 3 BIND but got ' + bindCommands.length)
})

test('pipeline: tracks in-flight PARSE in _pendingParsedStatements', function () {
  const client = helper.client()
  client._pipelineMode = true
  client._connected = true

  const con = client.connection
  con.parse = function () {}
  con.bind = function () {}
  con.describe = function () {}
  con.execute = function () {}
  con.sync = function () {}
  con.flush = function () {}
  con.stream = { cork: function () {}, uncork: function () {} }

  const statementName = 'trackedStmt'

  // Before any query - should be empty
  assert.equal(client._pendingParsedStatements[statementName], undefined)

  // Submit query with named statement
  client.query(new Query({ name: statementName, text: 'SELECT 1', values: [] }))

  // Should be tracked as in-flight
  assert.equal(
    client._pendingParsedStatements[statementName],
    'SELECT 1',
    'Statement should be tracked in _pendingParsedStatements'
  )
})

test('pipeline: clears _pendingParsedStatements after ParseComplete', function () {
  const client = helper.client()
  client._pipelineMode = true
  client._connected = true

  const con = client.connection
  con.parse = function () {}
  con.bind = function () {}
  con.describe = function () {}
  con.execute = function () {}
  con.sync = function () {}
  con.flush = function () {}
  con.stream = { cork: function () {}, uncork: function () {} }

  const statementName = 'clearableStmt'

  // Submit query
  client.query(new Query({ name: statementName, text: 'SELECT 1', values: [] }))

  // Should be tracked
  assert.equal(client._pendingParsedStatements[statementName], 'SELECT 1')

  // Simulate ParseComplete by calling _handleParseComplete
  // First, set up the pending query so _handleParseComplete can find it
  client._pendingQueries[0].name = statementName
  client._handleParseComplete()

  // Should be cleared from pending and added to parsedStatements
  assert.equal(
    client._pendingParsedStatements[statementName],
    undefined,
    '_pendingParsedStatements should be cleared after ParseComplete'
  )
  assert.equal(
    con.parsedStatements[statementName],
    'SELECT 1',
    'Statement should be in parsedStatements after ParseComplete'
  )
})

test('pipeline: reuses already-parsed statement without additional PARSE', function () {
  const client = helper.client()
  client._pipelineMode = true
  client._connected = true

  const con = client.connection
  const parseCommands = []

  con.parse = function (arg) {
    parseCommands.push(arg)
  }
  con.bind = function () {}
  con.describe = function () {}
  con.execute = function () {}
  con.sync = function () {}
  con.flush = function () {}
  con.stream = { cork: function () {}, uncork: function () {} }

  const statementName = 'reusableStmt'
  const queryText = 'SELECT 1'

  // First query - should trigger PARSE
  client.query(new Query({ name: statementName, text: queryText, values: [] }))
  assert.equal(parseCommands.length, 1, 'First query should trigger PARSE')

  // Simulate ParseComplete
  con.parsedStatements[statementName] = queryText
  delete client._pendingParsedStatements[statementName]

  // Second query - should NOT trigger PARSE
  client.query(new Query({ name: statementName, text: queryText, values: [] }))
  assert.equal(parseCommands.length, 1, 'Second query should reuse parsed statement')
})
