import { describe, it } from 'vitest'
import * as net from 'node:net'
import helper from './_test-helper.ts'
import assert from 'node:assert'
import buffers from '../../_test-buffers.ts'

describe('connection-timeout', () => {
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

  it('successful connection', () =>
    new Promise<void>((done) => {
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
    }))

  it('expired connection timeout', () =>
    new Promise<void>((done) => {
      const opts = { ...options, port: options.port + 1 }
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
    }))
})
