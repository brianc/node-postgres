'use strict'
const helper = require('./test-helper')
const Connection = require('../../../lib/connection')
const assert = require('assert')

const suite = new helper.Suite()
const { MemoryStream } = helper

function makeStream() {
  const stream = new MemoryStream()
  stream.destroy = function () {}
  return stream
}

function simulateReadyForQuery(con, params) {
  for (const [key, value] of Object.entries(params)) {
    con.emit('parameterStatus', { parameterName: key, parameterValue: value })
  }
  con.emit('readyForQuery', {})
}

// --- Basic multihost connectivity ---

suite.test('connects to single host', function (done) {
  const stream = makeStream()
  let connectPort, connectHost
  stream.connect = function (port, host) {
    connectPort = port
    connectHost = host
  }
  const con = new Connection({ stream: stream })
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
  const con = new Connection({ stream: () => streams[streamIndex++] })
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
  const con = new Connection(config)
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
  const con = new Connection({ stream: () => streams[streamIndex++] })
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
  const con = new Connection({ stream: () => streams[streamIndex++] })
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
  const con = new Connection({ stream: () => streams[streamIndex++] })
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
  const con = new Connection({ stream: () => streams[streamIndex++] })
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
  const con = new Connection({ stream: stream })
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

// --- targetSessionAttrs ---

suite.test('targetSessionAttrs=any does not intercept readyForQuery', function (done) {
  const stream = makeStream()
  const con = new Connection({ targetSessionAttrs: 'any', stream: stream })
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
  const con = new Connection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    assert.equal(streamIndex, 2)
    done()
  })
  con.connect([5432, 5433], ['standby', 'primary'])
  streams[0].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'on', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('targetSessionAttrs=read-write skips read-only and uses writable', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new Connection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['readonly', 'writable'])
  streams[0].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'on' })
  streams[1].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('targetSessionAttrs=read-only skips primary and uses standby', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new Connection({
    targetSessionAttrs: 'read-only',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['primary', 'standby'])
  streams[0].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'on', default_transaction_read_only: 'on' })
})

suite.test('targetSessionAttrs=primary skips standby and uses primary', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new Connection({
    targetSessionAttrs: 'primary',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['standby', 'primary'])
  streams[0].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'on', default_transaction_read_only: 'on' })
  streams[1].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('targetSessionAttrs=standby skips primary and uses hot standby', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new Connection({
    targetSessionAttrs: 'standby',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['primary', 'standby'])
  streams[0].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'on', default_transaction_read_only: 'on' })
})

suite.test('targetSessionAttrs=prefer-standby uses standby when available', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new Connection({
    targetSessionAttrs: 'prefer-standby',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    assert.equal(streamIndex, 2)
    done()
  })
  con.connect([5432, 5433], ['primary', 'standby'])
  streams[0].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'on', default_transaction_read_only: 'on' })
})

suite.test('targetSessionAttrs=prefer-standby falls back to primary when no standby available', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new Connection({
    targetSessionAttrs: 'prefer-standby',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['primary1', 'primary2'])
  streams[0].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('emits error when no host satisfies targetSessionAttrs', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new Connection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  assert.emits(con, 'error', function (err) {
    assert.ok(err.message.includes('read-write'))
    done()
  })
  con.connect([5432, 5433], ['standby1', 'standby2'])
  streams[0].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'on', default_transaction_read_only: 'off' })
  streams[1].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'on', default_transaction_read_only: 'off' })
})

suite.test('resets backend params between hosts when checking targetSessionAttrs', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new Connection({
    targetSessionAttrs: 'primary',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect([5432, 5433], ['standby', 'primary'])
  streams[0].emit('connect')
  // standby sends in_hot_standby=on → skip
  simulateReadyForQuery(con, { in_hot_standby: 'on', default_transaction_read_only: 'on' })
  streams[1].emit('connect')
  // primary must send its OWN params (not leftover from standby)
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('fetches session state via SHOW query when not provided in ParameterStatus', function (done) {
  const stream = makeStream()
  const con = new Connection({
    targetSessionAttrs: 'read-write',
    stream: stream,
  })
  con.once('readyForQuery', function () {
    done()
  })
  con.connect(5432, 'localhost')
  stream.emit('connect')
  // Emit readyForQuery without prior parameterStatus – triggers fetchingState
  con.emit('readyForQuery', {})
  // Simulate results of SHOW transaction_read_only; SELECT pg_is_in_recovery()
  con.emit('dataRow', { fields: [Buffer.from('off')] }) // transaction_read_only
  con.emit('dataRow', { fields: [Buffer.from('f')] }) // pg_is_in_recovery
  // Second readyForQuery (after the SHOW query) triggers the decision
  con.emit('readyForQuery', {})
})

suite.test('tries next host when SHOW query returns standby state', function (done) {
  let streamIndex = 0
  const streams = [makeStream(), makeStream()]
  const con = new Connection({
    targetSessionAttrs: 'read-write',
    stream: () => streams[streamIndex++],
  })
  con.once('readyForQuery', function () {
    assert.equal(streamIndex, 2)
    done()
  })
  con.connect([5432, 5433], ['standby', 'primary'])
  streams[0].emit('connect')
  // No parameterStatus → triggers fetch
  con.emit('readyForQuery', {})
  // SHOW results indicate standby (transaction_read_only=on)
  con.emit('dataRow', { fields: [Buffer.from('on')] })
  con.emit('dataRow', { fields: [Buffer.from('t')] })
  con.emit('readyForQuery', {})
  // Now on primary
  streams[1].emit('connect')
  simulateReadyForQuery(con, { in_hot_standby: 'off', default_transaction_read_only: 'off' })
})

suite.test('swallows rowDescription and commandComplete during SHOW fetch', function (done) {
  const stream = makeStream()
  const con = new Connection({
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
  con.emit('readyForQuery', {})
  // Protocol events during fetch are suppressed
  con.emit('rowDescription', {})
  con.emit('commandComplete', {})
  con.emit('dataRow', { fields: [Buffer.from('off')] })
  con.emit('dataRow', { fields: [Buffer.from('f')] })
  con.emit('readyForQuery', {})
})
