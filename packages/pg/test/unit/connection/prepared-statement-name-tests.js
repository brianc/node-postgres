'use strict'
// Regression tests for https://github.com/brianc/node-postgres/issues/3625
//
// The connection tracks which prepared statements have already been sent to the
// backend in `parsedStatements` / `submittedNamedStatements`. When those are
// plain `{}` objects, a statement named after an `Object.prototype` key such as
// `constructor` reads back as truthy even though it was never prepared, so the
// client skips the `Parse` message and sends a `Bind` for a statement the
// backend has never seen.
const helper = require('./test-helper')
const assert = require('assert')
const Connection = require('../../../lib/connection')
const Query = require('../../../lib/query')

const suite = new helper.Suite()
const { MemoryStream } = helper

const PROTOTYPE_STATEMENT_NAMES = ['constructor', 'hasOwnProperty', 'toString', '__proto__']

const makeConnection = function () {
  const con = new Connection({ stream: new MemoryStream() })
  con.connect()
  return con
}

suite.test('a fresh connection has no prepared statements for Object.prototype names', function () {
  const con = makeConnection()
  for (const name of PROTOTYPE_STATEMENT_NAMES) {
    assert.ok(
      !con.parsedStatements[name],
      `parsedStatements should not report '${name}' as already parsed on a fresh connection`
    )
    assert.ok(
      !con.submittedNamedStatements[name],
      `submittedNamedStatements should not report '${name}' as already submitted on a fresh connection`
    )
  }
})

suite.test('a statement named "constructor" is parsed before it is bound', function () {
  const con = makeConnection()

  const parsed = []
  const bound = []
  con.parse = function (query) {
    parsed.push(query)
  }
  con.bind = function (config) {
    bound.push(config)
  }

  const query = new Query({ text: 'SELECT $1::text', name: 'constructor', values: ['ok'] })
  const err = query.submit(con)

  assert.ifError(err)
  assert.equal(parsed.length, 1, 'a Parse message must be sent for a never-before-seen "constructor" statement')
  assert.equal(parsed[0].name, 'constructor')
  assert.equal(parsed[0].text, 'SELECT $1::text')
  assert.equal(bound.length, 1, 'the statement should also be bound after being parsed')
  assert.equal(bound[0].statement, 'constructor')
})

suite.test('hasBeenParsed is false for an unprepared Object.prototype-named statement', function () {
  const con = makeConnection()
  for (const name of PROTOTYPE_STATEMENT_NAMES) {
    const query = new Query({ text: 'SELECT 1', name })
    assert.ok(!query.hasBeenParsed(con), `hasBeenParsed must be false for the unprepared statement named '${name}'`)
  }
})
