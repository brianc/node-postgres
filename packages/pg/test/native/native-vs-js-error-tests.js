'use strict'
var assert = require('assert')
var Client = require('../../lib/client')
var NativeClient = require('../../lib/native')

var client = new Client()
var nativeClient = new NativeClient()

client.connect()
nativeClient.connect((err) => {
  client.query('SELECT alsdkfj', (err) => {
    client.end()

    nativeClient.query('SELECT lkdasjfasd', (nativeErr) => {
      for (var key in nativeErr) {
        assert.equal(err[key], nativeErr[key], `Expected err.${key} to equal nativeErr.${key}`)
      }
      nativeClient.end()
    })
  })
})
