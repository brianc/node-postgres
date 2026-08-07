'use strict'
const helper = require('./../test-helper')
const Client = require('./../../lib/native')
const suite = new helper.Suite()
const assert = require('assert')

// `namedQueries` is keyed by user-supplied statement name. Before it was made prototypeless a name
// matching a property of Object.prototype was truthy on a client that had prepared nothing, so the
// query was either rejected as a duplicate or handed to PQexecPrepared without ever being prepared.
// This mirrors the pure-JS coverage in test/unit/client/parsed-statements-prototype-tests.js.
const inheritedNames = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', '__proto__']

// Queries run one at a time: issuing them concurrently would queue them on the client and trip the
// pg@9.0 deprecation notice for querying while another query is in flight. `end` is only ever
// called from inside a query callback, because ending before the connection is established makes
// `Client.prototype.end` both defer and proceed, invoking its callback twice.
suite.test('a statement named after an inherited property is prepared and executed', function (done) {
  const client = new Client(helper.config)
  client.connect()

  // the cache is built in the constructor, so it can be inspected before anything is prepared
  for (const name of inheritedNames) {
    assert.strictEqual(client.namedQueries[name], undefined, `'${name}' should not resolve on a fresh client`)
  }
  assert.strictEqual(Object.getPrototypeOf(client.namedQueries), null)

  const runNext = function (i) {
    if (i === inheritedNames.length) {
      return client.end(done)
    }
    const name = inheritedNames[i]

    // first use: nothing is cached under this name, so it must be prepared before it can run
    client.query(
      { name: name, text: 'SELECT $1::int as num', values: [i] },
      assert.calls(function (err, result) {
        assert(!err, `preparing '${name}' failed: ${err && err.message}`)
        assert.equal(result.rows[0].num, i)
        assert.strictEqual(client.namedQueries[name], 'SELECT $1::int as num')

        // second use supplies no text, so it can only work if the first call cached the statement
        client.query(
          { name: name, values: [i + 1] },
          assert.calls(function (err, result) {
            assert(!err, `re-executing '${name}' failed: ${err && err.message}`)
            assert.equal(result.rows[0].num, i + 1)
            runNext(i + 1)
          })
        )
      })
    )
  }

  runNext(0)
})

suite.test('reusing a statement name for different text is still an error', function (done) {
  const client = new Client(helper.config)
  client.connect()

  client.query(
    { name: 'constructor', text: 'SELECT 1 as num' },
    assert.calls(function (err) {
      assert(!err, `preparing 'constructor' failed: ${err && err.message}`)

      client.query({ name: 'constructor', text: 'SELECT 2 as num' }, function (err) {
        assert(err instanceof Error, 'expected a duplicate statement name to be rejected')
        assert.ok(/must be unique/.test(err.message), `unexpected message: ${err.message}`)
        client.end(done)
      })
    })
  )
})
