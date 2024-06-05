'use strict'
var helper = require('./test-helper')
var Connection = require('../../../lib/connection')
var Client = require('../../../lib/client')

test('emits end when not in query', function () {
  var stream = new (require('events').EventEmitter)()
  stream.setNoDelay = () => {}
  stream.connect = function () {
    // NOOP
  }
  stream.write = function () {
    // NOOP
  }

  var client = new Client({ connection: new Connection({ stream: stream }) })
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
    assert.equal(client.queryQueue.length, 0)
    assert(client.activeQuery, 'client should have issued query')
    process.nextTick(function () {
      stream.emit('close')
    })
  })
})
