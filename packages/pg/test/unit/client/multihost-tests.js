'use strict'
const assert = require('assert')
const EventEmitter = require('events')
const helper = require('./test-helper')
const { Client } = helper

const suite = new helper.Suite()

// Minimal fake Connection that records connect() calls and exposes emit
function makeFakeConnection() {
  const con = new EventEmitter()
  con.connectCalls = []
  con.connect = function (port, host) {
    con.connectCalls.push({ port, host })
  }
  con.on = con.addListener.bind(con)
  con.once = EventEmitter.prototype.once.bind(con)
  con.removeAllListeners = EventEmitter.prototype.removeAllListeners.bind(con)
  con._ending = false
  con.requestSsl = function () {}
  con.startup = function () {}
  con.end = function () {}
  return con
}

// --- port array is threaded through to con.connect() ---

suite.test('passes port array to connection.connect', function () {
  const con = makeFakeConnection()
  const client = new Client({ connection: con, host: 'localhost', port: [5432, 5433] })
  client._connect(function () {})
  assert.deepStrictEqual(client.port, [5432, 5433])
  assert.deepStrictEqual(con.connectCalls[0].port, [5432, 5433])
})

// --- host array is threaded through to con.connect() ---

suite.test('passes host array to connection.connect', function () {
  const con = makeFakeConnection()
  const client = new Client({ connection: con, host: ['h1', 'h2'], port: 5432 })
  client._connect(function () {})
  assert.deepStrictEqual(client.host, ['h1', 'h2'])
  assert.deepStrictEqual(con.connectCalls[0].host, ['h1', 'h2'])
})

// --- both arrays together ---

suite.test('passes host and port arrays together to connection.connect', function () {
  const con = makeFakeConnection()
  const client = new Client({ connection: con, host: ['h1', 'h2'], port: [5432, 5433] })
  client._connect(function () {})
  assert.deepStrictEqual(con.connectCalls[0], { port: [5432, 5433], host: ['h1', 'h2'] })
})

// --- domain socket path is not broken by the array guard ---

suite.test('domain socket path still works with single string host', function () {
  const con = makeFakeConnection()
  con.connect = function (path) {
    con.connectCalls.push({ path })
  }
  const client = new Client({ connection: con, host: '/tmp/', port: 5432 })
  client._connect(function () {})
  assert.ok(con.connectCalls[0].path.startsWith('/tmp/'), 'should use domain socket path')
})

// --- array host does NOT trigger domain socket path ---

suite.test('array host with leading-slash element does not trigger domain socket', function () {
  const con = makeFakeConnection()
  const client = new Client({ connection: con, host: ['/tmp/', 'localhost'], port: 5432 })
  client._connect(function () {})
  // connect() must receive (port, host) signature, not a single socket path string
  const call = con.connectCalls[0]
  assert.ok('port' in call, 'should call connect(port, host) not connect(socketPath)')
  assert.ok('host' in call, 'should call connect(port, host) not connect(socketPath)')
})

// --- single host / single port unchanged ---

suite.test('single host and port are still passed as scalars', function () {
  const con = makeFakeConnection()
  const client = new Client({ connection: con, host: 'localhost', port: 5432 })
  client._connect(function () {})
  assert.strictEqual(con.connectCalls[0].port, 5432)
  assert.strictEqual(con.connectCalls[0].host, 'localhost')
})
