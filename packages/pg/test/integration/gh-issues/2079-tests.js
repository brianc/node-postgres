'use strict'
var helper = require('./../test-helper')
var assert = require('assert')

const suite = new helper.Suite()

// makes a backend server that responds with a non 'S' ssl response buffer
let makeTerminatingBackend = (byte) => {
  const { createServer } = require('net')

  const server = createServer((socket) => {
    // attach a listener so the socket can drain
    // https://www.postgresql.org/docs/9.3/protocol-message-formats.html
    socket.on('data', (buff) => {
      const code = buff.readInt32BE(4)
      // I don't see anything in the docs about 80877104
      // but libpq is sending it...
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
  const { port } = server.address()
  return port
}

suite.test('SSL connection error allows event loop to exit', (done) => {
  const port = makeTerminatingBackend('N')
  const client = new helper.pg.Client({ ssl: 'require', port, host: 'localhost' })
  // since there was a connection error the client's socket should be closed
  // and the event loop will have no refs and exit cleanly
  client.connect((err) => {
    assert(err instanceof Error)
    done()
  })
})

suite.test('Non "S" response code allows event loop to exit', (done) => {
  const port = makeTerminatingBackend('X')
  const client = new helper.pg.Client({ ssl: 'require', host: 'localhost', port })
  // since there was a connection error the client's socket should be closed
  // and the event loop will have no refs and exit cleanly
  client.connect((err) => {
    assert(err instanceof Error)
    done()
  })
})
