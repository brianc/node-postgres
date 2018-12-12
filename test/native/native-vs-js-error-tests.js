'use strict'
var assert = require('assert')
var Client = require('../../lib/client')
var NativeClient = require('../../lib/native')

var client = new Client()
var nativeClient = new NativeClient()

client.connect()
nativeClient.connect((err) => {
  var params = {
    text: 'SELECT lkdasjfasd',
    values: []
  };

  client.query(params, (err) => {
    client.end()

    nativeClient.query(params, (nativeErr) => {
      for (var key in nativeErr) {
        assert.deepStrictEqual(err[key], nativeErr[key], `Expected err.${key} to equal nativeErr.${key}`)
      }
      nativeClient.end()
    })
  })
})
