'use strict'
const helper = require('./../test-helper')
const assert = require('assert')
const net = require('net')
const pg = require('../../../lib')

const suite = new helper.Suite()

// a backend that answers the startup message with an authentication request
// pg-protocol does not know how to parse (code 7 is AuthenticationGSS)
suite.test('unsupported authentication request rejects connect', (done) => {
  const server = net.createServer((socket) => {
    socket.once('data', () => {
      const message = Buffer.alloc(9)
      message.write('R', 0)
      message.writeInt32BE(8, 1)
      message.writeInt32BE(7, 5)
      socket.write(message)
    })
    socket.on('error', () => {})
    socket.on('close', () => server.close())
  })
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    const client = new pg.Client({ host: '127.0.0.1', port, user: 'app', database: 'app' })
    client.on('error', () => {})
    client.connect((err) => {
      assert(err instanceof Error)
      assert(/Unknown authenticationOk message type 7/.test(err.message))
      done()
    })
  })
})
