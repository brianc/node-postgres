import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'
import * as net from 'node:net'
import buffers from '../../_test-buffers.ts'

describe('network-partition', () => {
  const Server = function (response) {
    this.server = undefined
    this.socket = undefined
    this.response = response
  }

  Server.prototype.start = function (cb) {
    // this is our fake postgres server
    // it responds with our specified response immediatley after receiving every buffer
    // this is sufficient into convincing the client its connectet to a valid backend
    // if we respond with a readyForQuery message
    this.server = net.createServer(
      function (socket) {
        this.socket = socket
        if (this.response) {
          this.socket.on(
            'data',
            function (data) {
              // deny request for SSL
              if (data.length == 8) {
                this.socket.write(Buffer.from('N', 'utf8'))
                // consider all authentication requests as good
              } else if (!data[0]) {
                this.socket.write(buffers.authenticationOk())
                // respond with our canned response
              } else {
                this.socket.write(this.response)
              }
            }.bind(this)
          )
        }
      }.bind(this)
    )

    const host = 'localhost'
    this.server.listen({ host, port: 0 }, () => {
      const port = this.server.address().port
      cb({
        host,
        port,
      })
    })
  }

  Server.prototype.drop = function () {
    this.socket.destroy()
  }

  Server.prototype.close = function (cb) {
    this.server.close(cb)
  }

  const testServer = function (server, cb) {
    // wait for our server to start
    server.start(function (options) {
      // connect a client to it
      const client = new helper.Client(options)
      client.connect().catch((err) => {
        assert(err instanceof Error)
        clearTimeout(timeoutId)
        server.close(cb)
      })

      server.server.on('connection', () => {
        // after 50 milliseconds, drop the client
        setTimeout(function () {
          server.drop()
        }, 50)
      })

      // blow up if we don't receive an error
      const timeoutId = setTimeout(function () {
        throw new Error('Client should have emitted an error but it did not.')
      }, 5000)
    })
  }

  it('readyForQuery server', () =>
    new Promise<void>((done) => {
      const respondingServer = new Server(buffers.readyForQuery())
      testServer(respondingServer, done)
    }))

  it('silent server', () =>
    new Promise<void>((done) => {
      const silentServer = new Server()
      testServer(silentServer, done)
    }))
})
