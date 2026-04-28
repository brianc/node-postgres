import { describe, it } from 'vitest'
import * as net from 'node:net'
import helper from './../_test-helper.ts'
import assert from 'node:assert'

describe('2627', () => {
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

  const serverWithInvalidResponse = (
    port: number,
    callback: (closeServer: (done: () => void) => void) => void
  ): void => {
    const sockets = new Set<net.Socket>()

    const server = net.createServer((socket: net.Socket) => {
      socket.write(MySqlHandshake)

      // This server sends an invalid response which should throw in pg-protocol
      sockets.add(socket)
    })

    let closing = false
    const closeServer = (done: () => void): void => {
      if (closing) return
      closing = true

      server.close(done)
      for (const socket of sockets) {
        socket.destroy()
      }
    }

    server.listen(port, options.host, () => callback(closeServer))
  }

  it('client should fail to connect', () =>
    new Promise<void>((done) => {
      serverWithInvalidResponse(options.port, (closeServer) => {
        const client = new helper.Client(options)

        client
          .connect()
          .then(() => {
            done(new Error('Expected client.connect() to fail') as never)
          })
          .catch((err) => {
            assert(err)
            assert(err.message.includes('invalid response'))
            closeServer(done)
          })
      })
    }))
})
