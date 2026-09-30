'use strict'

const assert = require('assert')
const EventEmitter = require('events')
const Connection = require('../../../lib/connection')
const stream = require('../../../lib/stream')
const helper = require('./test-helper')

const suite = new helper.Suite()
const test = suite.test.bind(suite)

class CancelStream extends EventEmitter {
  constructor(onWrite) {
    super()
    this.onWrite = onWrite
    this.writable = true
    this.destroyed = false
  }

  setNoDelay() {}
  setKeepAlive() {}

  connect(port, host) {
    this.port = port
    this.host = host
    process.nextTick(() => this.emit('connect'))
  }

  write(packet, callback) {
    this.packet = packet
    const accepted = this.onWrite(this, callback)
    return accepted === undefined ? true : accepted
  }

  destroy() {
    this.destroyed = true
  }
}

function cancellableConnection(onWrite) {
  const streams = []
  const connection = new Connection({
    stream: () => {
      const stream = new CancelStream(onWrite)
      streams.push(stream)
      return stream
    },
  })
  connection._connectPort = connection._cancelPort = 5432
  connection._connectHost = 'db.example.test'
  connection._cancelHost = '192.0.2.10'
  return { connection, streams }
}

test('uses the selected endpoint and resolves only after write completion then EOF', async () => {
  const { connection, streams } = cancellableConnection((stream, callback) => {
    callback()
    process.nextTick(() => stream.emit('close'))
  })

  await connection.cancelWithClone(123, 456, 50)
  const stream = streams[1]
  assert.strictEqual(stream.host, '192.0.2.10')
  assert.strictEqual(stream.port, 5432)
  assert.strictEqual(stream.packet.toString('hex'), '0000001004d2162e0000007b000001c8')
})

test('rejects EOF before write completion as ambiguous', async () => {
  const { connection } = cancellableConnection((stream) => {
    stream.emit('close')
  })

  await assert.rejects(connection.cancelWithClone(123, 456, 50), (error) => {
    assert.strictEqual(error.cancelDispatchMayHaveStarted, true)
    return /before the request was written/.test(error.message)
  })
})

test('rejects concrete custom stream instances before connect', async () => {
  const stream = new CancelStream(() => {})
  const connection = new Connection({ stream })
  connection._connectPort = 5432
  connection._connectHost = 'localhost'

  await assert.rejects(connection.cancelWithClone(123, 456, 50), (error) => {
    assert.strictEqual(error.cancelDispatchMayHaveStarted, false)
    return /concrete custom stream/.test(error.message)
  })
})

test('marks a rejected write as not dispatched', async () => {
  const { connection, streams } = cancellableConnection(() => {
    throw new Error('write must not be called')
  })
  const cancellation = connection.cancelWithClone(123, 456, 50)
  streams[1].writable = false

  await assert.rejects(cancellation, (error) => {
    assert.strictEqual(error.cancelDispatchMayHaveStarted, false)
    return /not writable/.test(error.message)
  })
  streams[1].emit('error', new Error('late socket error'))
})

test('treats write backpressure as accepted dispatch', async () => {
  const { connection } = cancellableConnection((socket, callback) => {
    callback()
    process.nextTick(() => socket.emit('close'))
    return false
  })

  await connection.cancelWithClone(123, 456, 50)
})

test('reuses a selected Unix socket path', async () => {
  const { connection, streams } = cancellableConnection((socket, callback) => {
    callback()
    process.nextTick(() => socket.emit('close'))
  })
  connection._cancelPort = '/var/run/postgresql/.s.PGSQL.5432'
  connection._cancelHost = undefined
  connection._connectHost = undefined

  await connection.cancelWithClone(123, 456, 50)
  assert.strictEqual(streams[1].port, '/var/run/postgresql/.s.PGSQL.5432')
  assert.strictEqual(streams[1].host, undefined)
})

test('bounds a written request that never reaches EOF', async () => {
  const { connection, streams } = cancellableConnection((socket, callback) => callback())

  await assert.rejects(connection.cancelWithClone(123, 456, 5), (error) => {
    assert.strictEqual(error.code, 'PG_CANCEL_TIMEOUT')
    assert.strictEqual(error.cancelDispatchMayHaveStarted, true)
    return true
  })
  assert.strictEqual(streams[1].destroyed, true)
})

async function testTlsCancel(sslNegotiation) {
  const rawStreams = []
  const secureStreams = []
  const tlsOptions = []
  const originalGetSecureStream = stream.getSecureStream

  stream.getSecureStream = (options) => {
    tlsOptions.push(options)
    const secure = new CancelStream((raw, callback) => {
      callback()
      process.nextTick(() => options.socket.emit('close'))
    })
    secureStreams.push(secure)
    return secure
  }

  try {
    const connection = new Connection({
      stream: () => {
        const raw = new CancelStream((socket, callback) => {
          assert.strictEqual(socket.packet.toString('hex'), '0000000804d2162f')
          callback?.()
          process.nextTick(() => socket.emit('data', Buffer.from('S')))
          return true
        })
        rawStreams.push(raw)
        return raw
      },
      ssl: { rejectUnauthorized: false },
      sslNegotiation,
    })
    connection._connectPort = connection._cancelPort = 5432
    connection._connectHost = 'db.example.test'
    connection._cancelHost = '192.0.2.10'

    await connection.cancelWithClone(123, 456, 50)
    assert.strictEqual(tlsOptions[0].servername, 'db.example.test')
    assert.strictEqual(secureStreams[0].packet.toString('hex'), '0000001004d2162e0000007b000001c8')
    if (sslNegotiation === 'direct') {
      assert.deepStrictEqual(tlsOptions[0].ALPNProtocols, ['postgresql'])
      assert.strictEqual(rawStreams[1].packet, undefined)
    }
  } finally {
    stream.getSecureStream = originalGetSecureStream
  }
}

test('preserves standard and direct TLS cancellation', async () => {
  await testTlsCancel('postgres')
  await testTlsCancel('direct')
})
