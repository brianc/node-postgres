import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'
import * as net from 'node:net'
import buffers from '../../_test-buffers.ts'

describe('network-partition', () => {
  class Server {
    server: net.Server | undefined = undefined
    socket: net.Socket | undefined = undefined
    response: Buffer | undefined

    constructor(response?: Buffer) {
      this.response = response
    }

    start(cb: (options: { host: string; port: number }) => void): void {
      // this is our fake postgres server
      // it responds with our specified response immediatley after receiving every buffer
      // this is sufficient into convincing the client its connectet to a valid backend
      // if we respond with a readyForQuery message
      this.server = net.createServer((socket: net.Socket) => {
        this.socket = socket
        if (this.response) {
          this.socket.on('data', (data: Buffer) => {
            // deny request for SSL
            if (data.length == 8) {
              this.socket!.write(Buffer.from('N', 'utf8'))
              // consider all authentication requests as good
            } else if (!data[0]) {
              this.socket!.write(buffers.authenticationOk())
              // respond with our canned response
            } else {
              this.socket!.write(this.response!)
            }
          })
        }
      })

      const host = 'localhost'
      this.server.listen({ host, port: 0 }, () => {
        const port = (this.server!.address() as net.AddressInfo).port
        cb({
          host,
          port,
        })
      })
    }

    drop(): void {
      this.socket!.destroy()
    }

    close(cb?: () => void): void {
      this.server!.close(cb)
    }
  }

  const testServer = function (server: Server, cb: () => void): void {
    // wait for our server to start
    server.start(function (options) {
      // connect a client to it
      const client = new helper.Client(options)
      client.connect().catch((err: unknown) => {
        assert(err instanceof Error)
        clearTimeout(timeoutId)
        server.close(cb)
      })

      server.server!.on('connection', () => {
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
