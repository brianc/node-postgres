'use strict'
var helper = require('./../test-helper')
var assert = require('assert')

var callbackError = new Error('TEST: Throw in callback')

const suite = new helper.Suite()

suite.test('it should cleanup client even if an error is thrown in a callback', (done) => {
  // temporarily replace the test framework's uncaughtException handlers
  // with a custom one that ignores the callbackError
  let original_handlers = process.listeners('uncaughtException')
  process.removeAllListeners('uncaughtException')
  process.on('uncaughtException', (err) => {
    if (err != callbackError) {
      original_handlers[0](err)
    }
  })

  // throw an error in a callback and verify that a subsequent query works without error
  var client = helper.client()
  client.query('SELECT NOW()', (err) => {
    assert(!err)
    setTimeout(reuseClient, 50)
    throw callbackError
  })

  function reuseClient() {
    client.query('SELECT NOW()', (err) => {
      assert(!err)

      // restore the test framework's uncaughtException handlers
      for (let handler of original_handlers) {
        process.on('uncaughtException', handler)
      }

      client.end(done)
    })
  }
})
