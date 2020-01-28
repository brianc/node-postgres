
"use strict"
var helper = require('./../test-helper')
var assert = require('assert')

const suite = new helper.Suite()

// makes a backend server that responds with a non 'S' ssl response buffer
const makeTerminatingBackend = (code) => {
  const { createServer }  = require('net')

  const server = createServer((socket) => {
    const packet = Buffer.from(code, 'utf-8')
    socket.write(packet)
    // attach a listener so the socket can drain
    socket.on('data', () => {

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
  const client = new helper.pg.Client({ ssl: true, port })
  // since there was a connection error the client's socket should be closed
  // and the event loop will have no refs and exit cleanly
  client.connect((err) => {
    assert(err instanceof Error)
    done()
  })
})


suite.test('Non "S" response code allows event loop to exit', (done) => {
  const port = makeTerminatingBackend('X')
  const client = new helper.pg.Client({ ssl: true, port })
  // since there was a connection error the client's socket should be closed
  // and the event loop will have no refs and exit cleanly
  client.connect((err) => {
    assert(err instanceof Error)
    done()
  })
})

