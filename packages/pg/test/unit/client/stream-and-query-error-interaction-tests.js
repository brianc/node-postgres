'use strict'
const helper = require('./test-helper')
const Connection = require('../../../lib/connection')
const Client = require('../../../lib/client')
const assert = require('assert')
const suite = new helper.Suite()

suite.test('emits end when not in query', function () {
  const stream = new (require('events').EventEmitter)()
  stream.setNoDelay = () => {}
  stream.connect = function () {
    // NOOP
  }
  stream.write = function () {
    // NOOP
  }

  const client = new Client({ connection: new Connection({ stream: stream }) })
  client.connect(
    assert.calls(function () {
      client.query(
        'SELECT NOW()',
        assert.calls(function (err, result) {
          assert(err)
        })
      )
    })
  )
  assert.emits(client, 'error')
  assert.emits(client, 'end')
  client.connection.emit('connect')
  process.nextTick(function () {
    client.connection.emit('readyForQuery')
    process.nextTick(function () {
      stream.emit('close')
    })
  })
})
