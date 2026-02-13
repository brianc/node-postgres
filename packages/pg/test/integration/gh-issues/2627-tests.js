'use strict'
const net = require('net')
const helper = require('./../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

const options = {
  host: 'localhost',
  port: Math.floor(Math.random() * 2000) + 2000,
  connectionTimeoutMillis: 2000,
  user: 'not',
  database: 'existing',
}

// This is the content of the packets sent by a MySQL server during the handshake.
// Those were captured with the `mysql:8.0.33` docker image.
const MySqlHandshake = Buffer.from(
  'SgAAAAo4LjAuMjgAHwAAAB4dKyUJZ2p6AP///wIA/98VAAAAAAAAAAAA' +
    'AAo1YiNJajgKKGkpfgBjYWNoaW5nX3NoYTJfcGFzc3dvcmQAIQAAAf+EBC' +
    'MwOFMwMUdvdCBwYWNrZXRzIG91dCBvZiBvcmRlcg==',
  'base64'
)

const serverWithInvalidResponse = (port, callback) => {
  const sockets = new Set()

  const server = net.createServer((socket) => {
    socket.write(MySqlHandshake)

    // This server sends an invalid response which should throw in pg-protocol
    sockets.add(socket)
  })

  let closing = false
  const closeServer = (done) => {
    if (closing) return
    closing = true

    server.close(done)
    for (const socket of sockets) {
      socket.destroy()
    }
  }

  server.listen(port, options.host, () => callback(closeServer))
}

suite.test('client should fail to connect', (done) => {
  serverWithInvalidResponse(options.port, (closeServer) => {
    const client = new helper.Client(options)

    client
      .connect()
      .then(() => {
        done(new Error('Expected client.connect() to fail'))
      })
      .catch((err) => {
        assert(err)
        assert(err.message.includes('invalid response'))
        closeServer(done)
      })
  })
})
