'use strict'

const assert = require('assert')
const net = require('net')
const { Client, Pool } = require('../../../lib')
const { Suite } = require('../../test-helper')

function authentication(code) {
  const packet = Buffer.alloc(9)
  packet[0] = 0x52
  packet.writeInt32BE(8, 1)
  packet.writeInt32BE(code, 5)
  return packet
}

async function createServer() {
  let rejectedConnections = 0
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    socket.once('data', () => {
      if (rejectedConnections++ === 0) {
        const packet = authentication(1234)
        socket.write(packet.subarray(0, 3))
        setImmediate(() => socket.write(packet.subarray(3)))
      } else {
        socket.write(Buffer.concat([authentication(0), Buffer.from([0x5a, 0, 0, 0, 5, 0x49])]))
        socket.on('data', (packet) => {
          if (packet[0] === 0x58) socket.end()
        })
      }
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    options: { host: '127.0.0.1', port: server.address().port, user: 'test', ssl: false },
    sockets,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(resolve)
      }),
  }
}

const suite = new Suite()

for (const api of ['client-promise', 'client-callback', 'pool']) {
  suite.test(`${api} rejects a split unsupported auth packet and permits a subsequent connection`, async () => {
    const fixture = await createServer()
    const target = api === 'pool' ? new Pool(fixture.options) : new Client(fixture.options)
    try {
      const connect =
        api === 'client-callback'
          ? new Promise((resolve, reject) => target.connect((error) => (error ? reject(error) : resolve())))
          : target.connect()
      await assert.rejects(connect, /Unknown authenticationOk message type 1234/)
      await target.end()

      const healthy = new Client(fixture.options)
      await healthy.connect()
      await healthy.end()
    } finally {
      await fixture.close()
    }
  })
}
