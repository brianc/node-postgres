'use strict'
const assert = require('assert')
const Client = require('../../lib/client')
const NativeClient = require('../../lib/native')

const client = new Client()
const nativeClient = new NativeClient()

client.connect()
nativeClient.connect((err) => {
  client.query('SELECT alsdkfj', (err) => {
    client.end()

    nativeClient.query('SELECT lkdasjfasd', (nativeErr) => {
      for (const key in nativeErr) {
        assert.equal(err[key], nativeErr[key], `Expected err.${key} to equal nativeErr.${key}`)
      }
      nativeClient.end()
    })
  })
})
