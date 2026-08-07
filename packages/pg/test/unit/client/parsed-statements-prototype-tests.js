'use strict'
const helper = require('./test-helper')
const Connection = require('../../../lib/connection')
const Query = require('../../../lib/query')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

// Properties every plain object inherits from Object.prototype. A prepared statement may
// legitimately be named any of these, and before `parsedStatements` was made prototypeless
// a lookup for one of them was truthy on a connection that had parsed nothing at all.
const inheritedNames = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', '__proto__']

// `submit` writes to the wire through these, so stub them out. The assertions below are all
// synchronous, so there is no need to emit the responses that would drive the query to 'end'.
const stubConnection = function () {
  const connection = new Connection({ stream: 'no' })
  connection.parsed = []
  connection.parse = function (arg) {
    connection.parsed.push(arg.name)
  }
  connection.bind = function () {}
  connection.describe = function () {}
  connection.execute = function () {}
  connection.flush = function () {}
  connection.sync = function () {}
  return connection
}

test('parsedStatements does not inherit from Object.prototype', function () {
  const connection = new Connection({ stream: 'no' })
  // asserted before getPrototypeOf because the inspected form of Object.prototype is itself
  // rendered `[Object: null prototype] {}`, which makes the bare prototype check hard to read
  for (const name of inheritedNames) {
    assert.strictEqual(
      connection.parsedStatements[name],
      undefined,
      `'${name}' should not resolve on a fresh connection`
    )
  }
  assert.strictEqual(Object.getPrototypeOf(connection.parsedStatements), null)
})

test('a statement named after an inherited property has not been parsed', function () {
  const connection = new Connection({ stream: 'no' })
  for (const name of inheritedNames) {
    const query = new Query({ text: 'select 1', name: name })
    assert.ok(!query.hasBeenParsed(connection), `expected '${name}' to be unparsed on a fresh connection`)
  }
})

test('a statement named after an inherited property is parsed rather than bound blind', function () {
  for (const name of inheritedNames) {
    const connection = stubConnection()
    const query = new Query({ text: 'select 1', name: name })

    assert.strictEqual(query.submit(connection), null, `expected '${name}' to be accepted`)
    assert.deepStrictEqual(connection.parsed, [name], `expected '${name}' to be sent to the backend for parsing`)
  }
})

// A query carrying only a name is the "execute the statement I prepared earlier" form. It skips
// the uniqueness check in submit() (which is guarded on `this.text`) and reaches hasBeenParsed,
// so it fails differently: the Parse is silently omitted and the backend is sent a Bind naming a
// statement it never prepared.
test('an inherited name with no text is treated like any other unknown name', function () {
  const ordinary = stubConnection()
  assert.strictEqual(new Query({ name: 'ordinary_name' }).submit(ordinary), null)

  for (const name of inheritedNames) {
    const inherited = stubConnection()
    assert.strictEqual(new Query({ name: name }).submit(inherited), null, `expected '${name}' to be accepted`)
    assert.deepStrictEqual(
      inherited.parsed,
      ordinary.parsed.length ? [name] : [],
      `'${name}' diverged from an ordinary name`
    )
  }
})

test('a statement named after an inherited property is recorded once parsed', function () {
  const connection = stubConnection()
  connection.parsedStatements['constructor'] = 'select 1'

  const query = new Query({ text: 'select 1', name: 'constructor' })
  assert.ok(query.hasBeenParsed(connection))

  assert.strictEqual(query.submit(connection), null)
  assert.deepStrictEqual(connection.parsed, [], 'expected an already-parsed statement not to be parsed again')
})

test('reusing a statement name for different text is still an error', function () {
  const connection = stubConnection()
  connection.parsedStatements['constructor'] = 'select 1'

  const query = new Query({ text: 'select 2', name: 'constructor' })
  const err = query.submit(connection)

  assert.ok(err instanceof Error)
  assert.ok(/must be unique/.test(err.message), `unexpected message: ${err.message}`)
})
