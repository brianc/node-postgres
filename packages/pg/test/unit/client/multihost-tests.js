'use strict'
const assert = require('assert')
const EventEmitter = require('events')
const helper = require('./test-helper')
const Connection = require('../../../lib/connection')
const MultiConnection = require('../../../lib/multi-connection')
const { Client } = helper

const suite = new helper.Suite()

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

suite.test('passes port array to connection.connect', function () {
  const con = makeFakeConnection()
  const client = new Client({ connection: con, host: ['localhost', '127.0.0.1'], port: [5432, 5433] })
  client._connect(function () {})
  assert.deepStrictEqual(client.port, [5432, 5433])
  assert.deepStrictEqual(con.connectCalls[0].port, [5432, 5433])
})

suite.test('passes host array to connection.connect', function () {
  const con = makeFakeConnection()
  const client = new Client({ connection: con, host: ['h1', 'h2'], port: 5432 })
  client._connect(function () {})
  assert.deepStrictEqual(client.host, ['h1', 'h2'])
  assert.deepStrictEqual(con.connectCalls[0].host, ['h1', 'h2'])
})

suite.test('passes host and port arrays together to connection.connect', function () {
  const con = makeFakeConnection()
  const client = new Client({ connection: con, host: ['h1', 'h2'], port: [5432, 5433] })
  client._connect(function () {})
  assert.deepStrictEqual(con.connectCalls[0], { port: [5432, 5433], host: ['h1', 'h2'] })
})

// --- Unix socket path is not broken by the array guard ---

suite.test('Unix socket path still works with single string host', function () {
  const con = makeFakeConnection()
  con.connect = function (path) {
    con.connectCalls.push({ path })
  }
  const client = new Client({ connection: con, host: '/tmp/', port: 5432 })
  client._connect(function () {})
  assert.ok(con.connectCalls[0].path.startsWith('/tmp/'), 'should use Unix socket path')
})

// --- single host / single port unchanged ---

suite.test('single host and port are still passed as scalars', function () {
  const con = makeFakeConnection()
  const client = new Client({ connection: con, host: 'localhost', port: 5432 })
  client._connect(function () {})
  assert.strictEqual(con.connectCalls[0].port, 5432)
  assert.strictEqual(con.connectCalls[0].host, 'localhost')
})

suite.test('uses MultiConnection for a host array', function () {
  const client = new Client({ host: ['host1', 'host2'], port: 5432 })
  assert.ok(client.connection instanceof MultiConnection)
})

suite.test('uses MultiConnection for a port array', function () {
  const client = new Client({ host: 'localhost', port: [5432] })
  assert.ok(client.connection instanceof MultiConnection)
})

suite.test('uses MultiConnection for targetSessionAttrs on one host', function () {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    targetSessionAttrs: 'read-write',
  })
  assert.ok(client.connection instanceof MultiConnection)
})

suite.test('keeps Connection for a plain single host', function () {
  const client = new Client({ host: 'localhost', port: 5432 })
  assert.ok(client.connection instanceof Connection)
})

suite.test('keeps an injected connection unchanged', function () {
  const con = makeFakeConnection()
  const client = new Client({
    connection: con,
    host: ['host1', 'host2'],
    port: 5432,
  })
  assert.strictEqual(client.connection, con)
})
