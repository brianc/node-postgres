'use strict'
const net = require('net')
const buffers = require('../../test-buffers')
const helper = require('./test-helper')

const suite = new helper.Suite()

const options = {
  host: 'localhost',
  port: Math.floor(Math.random() * 2000) + 2000,
  connectionTimeoutMillis: 2000,
  user: 'not',
  database: 'existing',
}

const serverWithConnectionTimeout = (port, timeout, callback) => {
  const sockets = new Set()

  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.once('end', () => sockets.delete(socket))

    socket.on('data', (data) => {
      // deny request for SSL
      if (data.length === 8) {
        socket.write(Buffer.from('N', 'utf8'))
        // consider all authentication requests as good
      } else if (!data[0]) {
        socket.write(buffers.authenticationOk())
        // send ReadyForQuery `timeout` ms after authentication
        setTimeout(() => socket.write(buffers.readyForQuery()), timeout).unref()
        // respond with our canned response
      } else {
        socket.write(buffers.readyForQuery())
      }
    })
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

suite.test('successful connection', (done) => {
  serverWithConnectionTimeout(options.port, 0, (closeServer) => {
    const timeoutId = setTimeout(() => {
      throw new Error('Client should have connected successfully but it did not.')
    }, 3000)

    const client = new helper.Client(options)
    client
      .connect()
      .then(() => client.end())
      .then(() => closeServer(done))
      .catch((err) => closeServer(() => done(err)))
      .then(() => clearTimeout(timeoutId))
  })
})

suite.test('expired connection timeout', (done) => {
  const opts = { ...options, port: 54322 }
  serverWithConnectionTimeout(opts.port, opts.connectionTimeoutMillis * 2, (closeServer) => {
    const timeoutId = setTimeout(() => {
      throw new Error('Client should have emitted an error but it did not.')
    }, 3000)

    const client = new helper.Client(opts)
    client
      .connect()
      .then(() => client.end())
      .then(() => closeServer(() => done(new Error('Connection timeout should have expired but it did not.'))))
      .catch((err) => {
        assert(err instanceof Error)
        assert(/timeout expired\s*/.test(err.message))
        closeServer(done)
      })
      .then(() => clearTimeout(timeoutId))
  })
})
