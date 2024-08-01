const net = require('net')
const buffers = require('../../test-buffers')
const helper = require('../test-helper')
const assert = require('assert')
const cli = require('../../cli')

const suite = new helper.Suite()

const options = {
  host: 'localhost',
  port: Math.floor(Math.random() * 2000) + 2000,
  connectionTimeoutMillis: 2000,
  user: 'not',
  database: 'existing',
}

const startMockServer = (port, timeout, callback) => {
  const sockets = new Set()

  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.once('end', () => sockets.delete(socket))

    socket.on('data', (data) => {
      // deny request for SSL
      if (data.length === 8) {
        socket.write(Buffer.from('N', 'utf8'))
        return
        // consider all authentication requests as good
      }
      // the initial message coming in has a 0 message type for authentication negotiation
      if (!data[0]) {
        socket.write(buffers.authenticationOk())
        // send ReadyForQuery `timeout` ms after authentication
        socket.write(buffers.readyForQuery())
        return
        // respond with our canned response
      }
      const code = data.toString('utf8', 0, 1)
      switch (code) {
        // parse
        case 'P':
          socket.write(buffers.parseComplete())
          socket.write(buffers.bindComplete())
          socket.write(buffers.rowDescription())
          socket.write(buffers.dataRow())
          socket.write(buffers.commandComplete('FOO BAR'))
          socket.write(buffers.readyForQuery())
          // this message is invalid, but sometimes sent out of order when using proxies or pg-bouncer
          setImmediate(() => {
            socket.write(buffers.parseComplete())
          })
          break
        case 'Q':
          socket.write(buffers.rowDescription())
          socket.write(buffers.dataRow())
          socket.write(buffers.commandComplete('FOO BAR'))
          socket.write(buffers.readyForQuery())
          // this message is invalid, but sometimes sent out of order when using proxies or pg-bouncer
          setImmediate(() => {
            socket.write(buffers.parseComplete())
          })
        default:
        // console.log('got code', code)
      }
    })
  })

  const closeServer = () => {
    for (const socket of sockets) {
      socket.destroy()
    }
    return new Promise((resolve) => {
      server.close(resolve)
    })
  }

  server.listen(port, options.host, () => callback(closeServer))
}

const delay = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

suite.testAsync('Out of order parseComplete on simple query is catchable', async () => {
  const closeServer = await new Promise((resolve, reject) => {
    return startMockServer(options.port, 0, (closeServer) => resolve(closeServer))
  })
  const client = new helper.Client(options)
  await client.connect()

  let errorHit = false
  client.on('error', () => {
    errorHit = true
  })

  await client.query('SELECT NOW')
  await delay(50)
  await client.query('SELECT NOW')
  await delay(50)
  await client.query('SELECT NOW')
  await delay(50)
  await client.end()
  assert(cli.native || errorHit)

  await closeServer()
})

suite.testAsync('Out of order parseComplete on extended query is catchable', async () => {
  const closeServer = await new Promise((resolve, reject) => {
    return startMockServer(options.port, 0, (closeServer) => resolve(closeServer))
  })
  const client = new helper.Client(options)
  await client.connect()

  let errorHit = false
  client.on('error', () => {
    errorHit = true
  })

  await client.query('SELECT $1', ['foo'])
  await delay(40)
  assert(cli.native || errorHit)
  await client.end()

  await closeServer()
})

suite.testAsync('Out of order parseComplete on pool is catchable', async () => {
  const closeServer = await new Promise((resolve, reject) => {
    return startMockServer(options.port, 0, (closeServer) => resolve(closeServer))
  })
  const pool = new helper.pg.Pool(options)

  let errorHit = false
  pool.on('error', () => {
    errorHit = true
  })

  await pool.query('SELECT $1', ['foo'])
  await delay(100)
  assert(cli.native || errorHit)

  await pool.end()
  await closeServer()
})
