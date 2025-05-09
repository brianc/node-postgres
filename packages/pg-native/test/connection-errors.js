'use strict'

const Client = require('../')
const assert = require('assert')

describe('connection errors', function () {
  it('raise error events', function (done) {
    const client = new Client()
    client.connectSync()
    client.query('SELECT pg_terminate_backend(pg_backend_pid())', assert.fail)
    client.on('error', function (err) {
      assert(err)
      assert.strictEqual(client.pq.resultErrorFields().sqlState, '57P01')
      client.end()
      done()
    })
  })
})
