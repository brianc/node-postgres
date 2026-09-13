'use strict'
const assert = require('assert')
const Client = require('../../lib/client')
const NativeClient = require('../../lib/native')

const client = new Client()
const nativeClient = new NativeClient()

// every field of an error the native client reports must be on the javascript one under the
// same name, and with the same value
const compare = (err, nativeErr) => {
  for (const key in nativeErr) {
    assert.equal(err[key], nativeErr[key], `Expected err.${key} to equal nativeErr.${key}`)
  }
}

const bothFail = (text, cb) => {
  client.query(text, (err) => {
    nativeClient.query(text, (nativeErr) => {
      compare(err, nativeErr)
      cb()
    })
  })
}

client.connect()
nativeClient.connect((err) => {
  assert(!err)
  bothFail('SELECT alsdkfj', () => {
    // a duplicate key carries a detail, a misspelt column a hint. A real table rather than a
    // temp one, whose schema is named after the connection
    const setup =
      'DROP TABLE IF EXISTS native_vs_js_dup; CREATE TABLE native_vs_js_dup (id int PRIMARY KEY); INSERT INTO native_vs_js_dup VALUES (1)'
    client.query(setup, (err) => {
      assert(!err)
      bothFail('INSERT INTO native_vs_js_dup VALUES (1)', () => {
        bothFail('SELECT cols FROM (SELECT 1 AS col) t', () => {
          client.query('DROP TABLE native_vs_js_dup', () => {
            client.end()
            nativeClient.end()
          })
        })
      })
    })
  })
})
