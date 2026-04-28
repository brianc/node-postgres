import { createServer } from 'node:net'
import { Buffer } from 'node:buffer'
import assert from 'node:assert'

import { describe, it } from 'vitest'

import helper from './../_test-helper.ts'

describe('2079', () => {
  // makes a backend server that responds with a non 'S' ssl response buffer
  const makeTerminatingBackend = (byte: string): number => {
    const server = createServer((socket) => {
      // attach a listener so the socket can drain
      // https://www.postgresql.org/docs/9.3/protocol-message-formats.html
      socket.on('data', (buff: Buffer) => {
        const code = buff.readInt32BE(4)
        if (code === 80877103 || code === 80877104) {
          const packet = Buffer.from(byte, 'utf-8')
          socket.write(packet)
        }
      })
      socket.on('close', () => {
        server.close()
      })
    })

    server.listen()
    const { port } = server.address() as { port: number }
    return port
  }

  it('SSL connection error allows event loop to exit', () =>
    new Promise<void>((done) => {
      const port = makeTerminatingBackend('N')
      const client = new helper.pg.Client({ ssl: 'require', port, host: 'localhost' })
      client.connect((err) => {
        assert(err instanceof Error)
        done()
      })
    }))

  it('Non "S" response code allows event loop to exit', () =>
    new Promise<void>((done) => {
      const port = makeTerminatingBackend('X')
      const client = new helper.pg.Client({ ssl: 'require', host: 'localhost', port })
      client.connect((err) => {
        assert(err instanceof Error)
        done()
      })
    }))
})
