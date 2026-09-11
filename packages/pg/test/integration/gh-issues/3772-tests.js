'use strict'
const helper = require('../test-helper')
const assert = require('assert')
const net = require('net')
const suite = new helper.Suite()

// These tests target the pure-JS connection state machine: `_ending` lives on
// `Connection` and is only consulted by the JS `reportStreamError`. The native
// (libpq) client has no such property, so there is nothing to assert here.
if (helper.args.native) {
  return
}

// https://github.com/brianc/node-postgres/issues/3769
//
// `Connection.prototype.sync()` used to set `_ending = true`. Sync is the
// extended-query protocol barrier sent after every parse/bind/execute, so the
// flag was left true for the entire life of a healthy connection. Because
// `reportStreamError` drops ECONNRESET/EPIPE while `_ending` is set, a genuine
// mid-connection teardown was silently ignored from the first parameterized
// query onwards: the socket error never reached the client, and recovery was
// left to the asynchronous close -> end path.
//
// These tests use a real PostgreSQL backend, reached through a local TCP proxy
// so the connection teardown can be triggered deterministically.

const PG_PORT = Number(helper.config.port) || 5432

// A TCP proxy in front of the real backend. Reports the port it listens on and
// exposes the sockets so a test can reset the connection like a pooler would.
function createProxy() {
  const server = net.createServer((clientSocket) => {
    const upstream = net.connect(PG_PORT, helper.config.host)
    clientSocket.pipe(upstream)
    upstream.pipe(clientSocket)
    server.lastClientSocket = clientSocket
    server.sockets = server.sockets || []
    server.sockets.push(clientSocket, upstream)
    clientSocket.on('error', () => {})
    upstream.on('error', () => {})
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

function closeProxy(server) {
  // Tear down every socket so the process is free to exit.
  ;(server.sockets || []).forEach((sock) => {
    try {
      sock.destroy()
    } catch (_) {
      // the socket may already be torn down; nothing to clean up
    }
  })
  return new Promise((resolve) => server.close(() => resolve()))
}

function connectThroughProxy(port, options) {
  const client = new helper.pg.Client({
    ...helper.config,
    host: '127.0.0.1',
    port,
    ...options,
  })
  // A teardown is expected in these tests; collect client errors instead of
  // letting an unhandled 'error' event fail the process.
  client.clientErrors = []
  client.on('error', (err) => client.clientErrors.push(err))
  // The proxy connection is reset on purpose, so don't let an in-flight socket
  // keep the process alive after the test finishes.
  return client
}

// Wait for `promise` to settle, reporting how it settled.
function settle(promise, timeoutMillis = 10000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ settled: false }), timeoutMillis)
    promise.then(
      () => {
        clearTimeout(timer)
        resolve({ settled: true, rejected: false })
      },
      (err) => {
        clearTimeout(timer)
        resolve({ settled: true, rejected: true, error: err })
      }
    )
  })
}

const codesFrom = (errors) => errors.map((e) => e && e.code).filter(Boolean)

suite.test('a real extended-protocol query does not mark the connection as ending', async () => {
  const client = new helper.pg.Client(helper.config)
  client.on('error', () => {})
  await client.connect()

  // Prime with a simple query, then run a parameterized query. The parameterized
  // query goes through parse/bind/execute and really does write a Sync to the
  // socket, which is what used to set _ending.
  await client.query('SELECT 1 AS one')
  assert.equal(client.connection._ending, false, 'a simple query should not set _ending')

  await client.query('SELECT $1::int AS n', [1])
  assert.equal(
    client.connection._ending,
    false,
    'Sync is the extended-query barrier, not a disconnect: _ending must stay false'
  )

  // Still usable afterwards, and still not "ending".
  const { rows } = await client.query('SELECT $1::text AS t', ['still here'])
  assert.equal(rows[0].t, 'still here')
  assert.equal(client.connection._ending, false)

  await client.end()
})

suite.test('a mid-query connection reset is reported, not swallowed by Sync', async () => {
  const { server, port } = await createProxy()
  const client = connectThroughProxy(port)

  try {
    await client.connect()

    // Extended-protocol query, so Sync has already run on this connection.
    await client.query('SELECT $1::int AS n', [1])

    // Start a query that will still be in flight when the connection is reset.
    const inFlight = client.query({ text: 'SELECT pg_sleep($1)', values: [2] })
    const settled = settle(inFlight)

    // Reset the TCP connection the way an origin/pooler teardown would.
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.ok(server.lastClientSocket, 'expected the proxy to have a client socket to reset')
    server.lastClientSocket.resetAndDestroy()

    const result = await settled
    assert.ok(result.settled, 'the in-flight query must settle rather than hang forever')

    // The socket error must reach the client. Before the fix, Sync left _ending
    // set, so reportStreamError dropped the socket error and only the generic
    // "Connection terminated unexpectedly" error from the close path was seen.
    const seen = codesFrom(client.clientErrors).concat(result.rejected ? codesFrom([result.error]) : [])
    assert.ok(
      seen.includes('ECONNRESET') || seen.includes('EPIPE'),
      'the underlying socket error should be reported to the client; saw: ' +
        JSON.stringify(seen) +
        ' client errors: ' +
        JSON.stringify(client.clientErrors.map((e) => e.message))
    )
  } finally {
    try {
      await client.end()
    } catch (_) {
      // the connection was reset on purpose; end() rejecting is expected
    }
    await closeProxy(server)
  }
})
