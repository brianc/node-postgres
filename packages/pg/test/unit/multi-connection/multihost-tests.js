'use strict'
const helper = require('../test-helper')
const MultiConnection = require('../../../lib/multi-connection')
const assert = require('assert')

const suite = new helper.Suite()
const { MemoryStream } = helper

function makeStream() {
  const stream = new MemoryStream()
  stream.destroy = function () {}
  return stream
}

function makeErrorMessageBuf() {
  // 'E' + length + 'S' + 'ERROR\0' + '\0'
  const content = Buffer.concat([Buffer.from('SERROR\0'), Buffer.from([0x00])])
  const len = 4 + content.length
  const buf = Buffer.allocUnsafe(1 + len)
  buf[0] = 0x45 // 'E'
  buf.writeUInt32BE(len, 1)
  content.copy(buf, 5)
  return buf
}

function makeParameterStatusBuf(name, value) {
  const n = Buffer.from(name + '\0')
  const v = Buffer.from(value + '\0')
  const len = 4 + n.length + v.length
  const buf = Buffer.allocUnsafe(1 + len)
  buf[0] = 0x53 // 'S'
  buf.writeUInt32BE(len, 1)
  n.copy(buf, 5)
  v.copy(buf, 5 + n.length)
  return buf
}

function makeReadyForQueryBuf() {
  return Buffer.from([0x5a, 0x00, 0x00, 0x00, 0x05, 0x49]) // 'Z' len=5 status='I'
}

function makeDataRowBuf(fields) {
  const bufs = fields.map((f) => (Buffer.isBuffer(f) ? f : Buffer.from(f)))
  let dataLen = 2 // Int16 field count
  for (const f of bufs) dataLen += 4 + f.length // Int32 len + data
  const totalLen = 4 + dataLen // Int32 length field includes itself
  const buf = Buffer.allocUnsafe(1 + totalLen)
  buf[0] = 0x44 // 'D'
  buf.writeUInt32BE(totalLen, 1)
  buf.writeUInt16BE(bufs.length, 5)
  let offset = 7
  for (const f of bufs) {
    buf.writeInt32BE(f.length, offset)
    offset += 4
    f.copy(buf, offset)
    offset += f.length
  }
  return buf
}

function makeRowDescriptionBuf() {
  // 'T', length=6, field count=0
  return Buffer.from([0x54, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00])
}

function makeCommandCompleteBuf() {
  const tag = Buffer.from('SELECT 1\0')
  const len = 4 + tag.length
  const buf = Buffer.allocUnsafe(1 + len)
  buf[0] = 0x43 // 'C'
  buf.writeUInt32BE(len, 1)
  tag.copy(buf, 5)
  return buf
}

function simulateReadyForQuery(stream, params) {
  for (const [key, value] of Object.entries(params)) {
    stream.emit('data', makeParameterStatusBuf(key, value))
  }
  stream.emit('data', makeReadyForQueryBuf())
}

suite.test('connects to single host', function (done) {
  const stream = makeStream()
  let connectPort, connectHost
  stream.connect = function (port, host) {
    connectPort = port
    connectHost = host
  }
  const con = new MultiConnection({ stream: stream })
  con.once('connect', function () {
    assert.equal(connectPort, 5432)
    assert.equal(connectHost, 'localhost')
    done()
  })
  con.connect(5432, 'localhost')
  stream.emit('connect')
})

suite.test('connects to first host when multiple are given', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const connectCalls = []
  streams.forEach((s) => {
    s.connect = function (port, host) {
      connectCalls.push({ port, host })
    }
  })
  const con = new MultiConnection({ stream: () => streams[streamIndex++] })
  con.once('connect', function () {
    assert.equal(connectCalls.length, 1)
    assert.equal(connectCalls[0].host, 'host1')
    assert.equal(connectCalls[0].port, 5432)
    done()
  })
  con.connect([5432, 5433], ['host1', 'host2'])
  streams[0].emit('connect')
})

suite.test('stream factory receives same config on failover streams', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const factoryArgs = []
  const config = {
    ssl: false,
    stream: function (opts) {
      factoryArgs.push(opts)
      return streams[streamIndex++]
    },
  }
  const con = new MultiConnection(config)
  con.once('connect', function () {
    assert.equal(factoryArgs.length, 2)
    assert.strictEqual(factoryArgs[0], config)
    assert.strictEqual(factoryArgs[1], config)
    done()
  })
  con.connect([5432, 5433], ['host1', 'host2'])
  const err = new Error('Connection refused')
  err.code = 'ECONNREFUSED'
  streams[0].emit('error', err)
  streams[1].emit('connect')
})

suite.test('falls back to second host on connection error', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const connectCalls = []
  streams.forEach((s) => {
    s.connect = function (port, host) {
      connectCalls.push({ port, host })
    }
  })
  const con = new MultiConnection({ stream: () => streams[streamIndex++] })
  con.once('connect', function () {
    assert.equal(connectCalls.length, 2)
    assert.equal(connectCalls[0].host, 'host1')
    assert.equal(connectCalls[1].host, 'host2')
    done()
  })
  con.connect([5432, 5433], ['host1', 'host2'])
  const err = new Error('Connection refused')
  err.code = 'ECONNREFUSED'
  streams[0].emit('error', err)
  streams[1].emit('connect')
})

suite.test('uses matching port for each host by index', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const connectCalls = []
  streams.forEach((s) => {
    s.connect = function (port, host) {
      connectCalls.push({ port, host })
    }
  })
  const con = new MultiConnection({ stream: () => streams[streamIndex++] })
  con.once('connect', function () {
    assert.equal(connectCalls[0].port, 5432)
    assert.equal(connectCalls[1].port, 5433)
    done()
  })
  con.connect([5432, 5433], ['host1', 'host2'])
  const err = new Error('Connection refused')
  err.code = 'ECONNREFUSED'
  streams[0].emit('error', err)
  streams[1].emit('connect')
})

suite.test('reuses single port for all hosts when port is not an array', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const connectPorts = []
  streams.forEach((s) => {
    s.connect = function (port) {
      connectPorts.push(port)
    }
  })
  const con = new MultiConnection({ stream: () => streams[streamIndex++] })
  con.once('connect', function () {
    assert.equal(connectPorts[0], 5432)
    assert.equal(connectPorts[1], 5432)
    done()
  })
  con.connect(5432, ['host1', 'host2'])
  const err = new Error('Connection refused')
  err.code = 'ECONNREFUSED'
  streams[0].emit('error', err)
  streams[1].emit('connect')
})

suite.test('emits error after all hosts fail', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({ stream: () => streams[streamIndex++] })
  assert.emits(con, 'error', function () {
    done()
  })
  con.connect([5432, 5433], ['host1', 'host2'])
  const err1 = new Error('Connection refused')
  err1.code = 'ECONNREFUSED'
  streams[0].emit('error', err1)
  const err2 = new Error('Connection refused')
  err2.code = 'ECONNREFUSED'
  streams[1].emit('error', err2)
})

suite.test('does not fall back after successful connect', function (done) {
  const stream = makeStream()
  const con = new MultiConnection({ stream: stream })
  con.once('connect', function () {
    assert.emits(con, 'error', function (err) {
      assert.equal(err.code, 'ECONNRESET')
      done()
    })
    const err = new Error('Connection reset')
    err.code = 'ECONNRESET'
    stream.emit('error', err)
  })
  con.connect([5432, 5433], ['host1', 'host2'])
  stream.emit('connect')
})

suite.test('targetSessionAttrs=any does not intercept readyForQuery', function (done) {
  const stream = makeStream()
  const con = new MultiConnection({ targetSessionAttrs: 'any', stream: stream })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect(5432, 'localhost')
  stream.emit('connect')
  con.emit('readyForQuery', {})
})

suite.test('targetSessionAttrs=read-write skips hot standby and uses primary', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    assert.equal(streamIndex, 2)
    done()
  })
  con.connect([5432, 5433], ['standby', 'primary'])
  streams[0].emit('connect')
  simulateReadyForQuery(streams[0], { in_hot_standby: 'on', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('targetSessionAttrs=read-write skips read-only and uses writable', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['readonly', 'writable'])
  streams[0].emit('connect')
  simulateReadyForQuery(streams[0], { in_hot_standby: 'off', default_transaction_read_only: 'on' })
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('targetSessionAttrs=read-only skips primary and uses standby', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'read-only',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['primary', 'standby'])
  streams[0].emit('connect')
  simulateReadyForQuery(streams[0], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'on', default_transaction_read_only: 'on' })
})

suite.test('targetSessionAttrs=primary skips standby and uses primary', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'primary',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['standby', 'primary'])
  streams[0].emit('connect')
  simulateReadyForQuery(streams[0], { in_hot_standby: 'on', default_transaction_read_only: 'on' })
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('targetSessionAttrs=standby skips primary and uses hot standby', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'standby',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['primary', 'standby'])
  streams[0].emit('connect')
  simulateReadyForQuery(streams[0], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'on', default_transaction_read_only: 'on' })
})

suite.test('targetSessionAttrs=prefer-standby uses standby when available', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'prefer-standby',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    assert.equal(streamIndex, 2)
    done()
  })
  con.connect([5432, 5433], ['primary', 'standby'])
  streams[0].emit('connect')
  simulateReadyForQuery(streams[0], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'on', default_transaction_read_only: 'on' })
})

suite.test('targetSessionAttrs=prefer-standby falls back to primary when no standby available', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'prefer-standby',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['primary1', 'primary2'])
  streams[0].emit('connect')
  simulateReadyForQuery(streams[0], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('emits error when no host satisfies targetSessionAttrs', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  assert.emits(con, 'error', function (err) {
    assert.ok(err.message.includes('read-write'))
    done()
  })
  con.connect([5432, 5433], ['standby1', 'standby2'])
  streams[0].emit('connect')
  simulateReadyForQuery(streams[0], { in_hot_standby: 'on', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'on', default_transaction_read_only: 'off' })
})

suite.test('resets backend params between hosts when checking targetSessionAttrs', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'primary',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['standby', 'primary'])
  streams[0].emit('connect')
  // standby sends in_hot_standby=on → skip
  simulateReadyForQuery(streams[0], { in_hot_standby: 'on', default_transaction_read_only: 'on' })
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('fetches session state via SHOW query when not provided in ParameterStatus', function (done) {
  const stream = makeStream()
  const con = new MultiConnection({
    targetSessionAttrs: 'read-write',
    stream: stream,
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect(5432, 'localhost')
  stream.emit('connect')
  stream.emit('data', makeReadyForQueryBuf())
  stream.emit('data', makeDataRowBuf([Buffer.from('off')]))
  stream.emit('data', makeReadyForQueryBuf())
})

suite.test('tries next host when SHOW query returns standby state', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    assert.equal(streamIndex, 2)
    done()
  })
  con.connect([5432, 5433], ['standby', 'primary'])
  streams[0].emit('connect')
  streams[0].emit('data', makeReadyForQueryBuf())
  streams[0].emit('data', makeDataRowBuf([Buffer.from('on')])) // transaction_read_only=on
  streams[0].emit('data', makeReadyForQueryBuf())
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('prefer-standby triggers pass 2 when all hosts fail TCP in pass 1', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream(), makeStream()]
  const connectHosts = []
  streams.forEach((s) => {
    s.connect = function (_port, host) {
      connectHosts.push(host)
    }
  })
  const con = new MultiConnection({
    targetSessionAttrs: 'prefer-standby',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    // pass 2 reconnects from the beginning of the host list
    assert.equal(connectHosts[2], 'host1')
    done()
  })
  con.connect([5432, 5433], ['host1', 'host2'])
  const err1 = new Error('Connection refused')
  err1.code = 'ECONNREFUSED'
  streams[0].emit('error', err1)
  const err2 = new Error('Connection refused')
  err2.code = 'ECONNREFUSED'
  streams[1].emit('error', err2)
  streams[2].emit('connect')
  simulateReadyForQuery(streams[2], { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('probe error causes next host to be tried', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    assert.equal(streamIndex, 2)
    done()
  })
  con.connect([5432, 5433], ['host1', 'host2'])
  streams[0].emit('connect')
  streams[0].emit('data', makeReadyForQueryBuf())
  streams[0].emit('data', makeErrorMessageBuf())
  streams[0].emit('data', makeReadyForQueryBuf())
  streams[1].emit('connect')
  streams[1].emit('data', makeReadyForQueryBuf())
  streams[1].emit('data', makeDataRowBuf([Buffer.from('off')]))
  streams[1].emit('data', makeReadyForQueryBuf())
})

suite.test('read-only host accepted when tx_read_only probe returns on', function (done) {
  const stream = makeStream()
  const con = new MultiConnection({
    targetSessionAttrs: 'read-only',
    stream: stream,
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect(5432, 'localhost')
  stream.emit('connect')
  stream.emit('data', makeReadyForQueryBuf())
  stream.emit('data', makeDataRowBuf([Buffer.from('on')]))
  stream.emit('data', makeReadyForQueryBuf())
})

suite.test('swallows rowDescription and commandComplete during SHOW fetch', function (done) {
  const stream = makeStream()
  const con = new MultiConnection({
    targetSessionAttrs: 'read-write',
    stream: stream,
  })
  const unexpectedEvents = []
  for (const evt of ['rowDescription', 'commandComplete']) {
    con.on(evt, function () {
      unexpectedEvents.push(evt)
    })
  }
  con.once('readyForQuery', function () {
    assert.equal(unexpectedEvents.length, 0)
    done()
  })
  con.connect(5432, 'localhost')
  stream.emit('connect')
  stream.emit('data', makeReadyForQueryBuf())
  stream.emit('data', makeRowDescriptionBuf())
  stream.emit('data', makeDataRowBuf([Buffer.from('off')])) // transaction_read_only=off
  stream.emit('data', makeCommandCompleteBuf())
  stream.emit('data', makeReadyForQueryBuf())
})

suite.test('forwards protocol events through the facade', function (done) {
  const stream = makeStream()
  const con = new MultiConnection({ stream: stream })
  con.once('readyForQuery', function (msg) {
    assert.equal(msg.status, 'I')
    done()
  })
  con.connect(5432, 'localhost')
  stream.emit('connect')
  stream.emit('data', makeReadyForQueryBuf())
})

suite.test('exposes the active stream and parsed statements', function () {
  const stream = makeStream()
  const con = new MultiConnection({ stream: stream })
  con.connect(5432, 'localhost')
  assert.strictEqual(con.stream, stream)
  assert.strictEqual(con.parsedStatements, con._connection.parsedStatements)
})

suite.test('delegates protocol writes to the active connection', function () {
  const stream = makeStream()
  const con = new MultiConnection({ stream: stream })
  con.connect(5432, 'localhost')
  con.startup({ user: 'test', database: 'test' })
  assert.equal(stream.packets.length, 1)
})

suite.test('emits readyForQuery only for the accepted candidate', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  let readyCount = 0
  con.on('readyForQuery', function () {
    readyCount++
    assert.equal(readyCount, 1)
    assert.equal(streamIndex, 2)
    done()
  })
  con.connect(5432, ['standby', 'primary'])
  streams[0].emit('connect')
  simulateReadyForQuery(streams[0], {
    in_hot_standby: 'on',
    default_transaction_read_only: 'off',
  })
  assert.equal(readyCount, 0)
  streams[1].emit('connect')
  simulateReadyForQuery(streams[1], {
    in_hot_standby: 'off',
    default_transaction_read_only: 'off',
  })
})

suite.test('connects to a Unix socket selected from a host array', function (done) {
  const stream = makeStream()
  stream.connect = function (path, host) {
    assert.equal(path, '/tmp/.s.PGSQL.5432')
    assert.equal(host, undefined)
  }
  const con = new MultiConnection({ stream: stream })
  con.once('connect', done)
  con.connect(5432, ['/tmp', 'localhost'])
  stream.emit('connect')
})

suite.test('falls back from a Unix socket to TCP', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const calls = []
  streams[0].connect = function (path) {
    calls.push({ path: path })
  }
  streams[1].connect = function (port, host) {
    calls.push({ port: port, host: host })
  }
  const con = new MultiConnection({ stream: () => streams[streamIndex++] })
  con.once('connect', function () {
    assert.deepStrictEqual(calls, [
      { path: '/var/run/postgresql/.s.PGSQL.5432' },
      { port: 5433, host: 'db.example.com' },
    ])
    done()
  })
  con.connect([5432, 5433], ['/var/run/postgresql', 'db.example.com'])
  const error = new Error('Connection refused')
  error.code = 'ECONNREFUSED'
  streams[0].emit('error', error)
  streams[1].emit('connect')
})

suite.test('falls back from TCP to a Unix socket', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const calls = []
  streams[0].connect = function (port, host) {
    calls.push({ port: port, host: host })
  }
  streams[1].connect = function (path) {
    calls.push({ path: path })
  }
  const con = new MultiConnection({ stream: () => streams[streamIndex++] })
  con.once('connect', function () {
    assert.deepStrictEqual(calls, [
      { port: 5432, host: 'db.example.com' },
      { path: '/var/run/postgresql/.s.PGSQL.5433' },
    ])
    done()
  })
  con.connect([5432, 5433], ['db.example.com', '/var/run/postgresql/'])
  const error = new Error('Connection refused')
  error.code = 'ECONNREFUSED'
  streams[0].emit('error', error)
  streams[1].emit('connect')
})

suite.test('does not forward end from a rejected candidate', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({ stream: () => streams[streamIndex++] })
  let endCount = 0
  con.on('end', function () {
    endCount++
  })
  con.once('connect', function () {
    assert.equal(streamIndex, 2)
    streams[0].emit('close')
    assert.equal(endCount, 0)
    done()
  })
  con.connect(5432, ['host1', 'host2'])
  const error = new Error('Connection refused')
  error.code = 'ECONNREFUSED'
  streams[0].emit('error', error)
  streams[1].emit('connect')
})

suite.test('absorbs late errors from a rejected candidate', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new MultiConnection({ stream: () => streams[streamIndex++] })
  con.once('connect', function () {
    assert.doesNotThrow(function () {
      streams[0].emit('error', new Error('late candidate error'))
    })
    done()
  })
  con.connect(5432, ['host1', 'host2'])
  const error = new Error('Connection refused')
  error.code = 'ECONNREFUSED'
  streams[0].emit('error', error)
  streams[1].emit('connect')
})

suite.test('delegates end to the accepted candidate', function (done) {
  const stream = makeStream()
  let ended = false
  stream.end = function () {
    ended = true
  }
  const con = new MultiConnection({ stream: stream })
  con.connect(5432, 'localhost')
  stream.emit('connect')
  con.end()
  setImmediate(function () {
    assert.equal(ended, true)
    done()
  })
})
