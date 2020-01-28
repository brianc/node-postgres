
"use strict"
var helper = require('./../test-helper')
var assert = require('assert')

const suite = new helper.Suite()

suite.test('SSL connection error allows event loop to exit', (done) => {
  const client = new helper.pg.Client({ ssl: true })
  // since there was a connection error the client's socket should be closed
  // and the event loop will have no refs and exit cleanly
  client.connect((err) => {
    assert(err instanceof Error)
    done()
  })
})

