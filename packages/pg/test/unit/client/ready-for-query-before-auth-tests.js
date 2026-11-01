'use strict'
require('./test-helper')
const net = require('net')
const pg = require('../../../lib/index.js')
const assert = require('assert')

const message = (type, body) => {
  const head = Buffer.alloc(5)
  head.write(type, 0)
  head.writeInt32BE(body.length + 4, 1)
  return Buffer.concat([head, body])
}
const authenticationOk = message('R', Buffer.alloc(4))
const readyForQuery = message('Z', Buffer.from('I'))

const withServer = function (onStartup, run) {
  const sockets = []
  const server = net.createServer(function (socket) {
    sockets.push(socket)
    socket.once('data', function () {
      onStartup(socket)
    })
  })
  server.listen(0, '127.0.0.1', function () {
    const client = new pg.Client({
      host: '127.0.0.1',
      port: server.address().port,
      user: 'app',
      password: 'secret',
      database: 'app',
    })
    run(client, function () {
      for (const socket of sockets) {
        socket.destroy()
      }
      server.close()
    })
  })
}

// a server answering the startup message with ReadyForQuery and no
// authentication message must be refused, not treated as connected
withServer(
  function (socket) {
    socket.write(readyForQuery)
  },
  function (client, done) {
    client.connect(
      assert.calls(function (err) {
        assert(err)
        assert.strictEqual(err.message, 'expected authentication request from server, but received Z')
        done()
      })
    )
  }
)

// sanity check: AuthenticationOk followed by ReadyForQuery still connects
withServer(
  function (socket) {
    socket.write(Buffer.concat([authenticationOk, readyForQuery]))
  },
  function (client, done) {
    client.connect(
      assert.calls(function (err) {
        assert.ifError(err)
        client.end(done)
      })
    )
  }
)
