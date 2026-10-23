'use strict'

const assert = require('assert')
const net = require('net')
const { once } = require('events')
const helper = require('./test-helper')
const { Client, Pool } = helper.pg
const suite = new helper.Suite()

if (helper.args.native) return

async function unusedPort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

suite.test('TCP fallback supports prepared statements and both TLS negotiations', async () => {
  let serverVersion
  for (const sslnegotiation of [undefined, 'postgres', 'direct']) {
    if (sslnegotiation === 'direct' && serverVersion < 170000) continue
    const client = new Client({
      ...helper.config,
      host: ['127.0.0.1', helper.config.host],
      port: [await unusedPort(), helper.config.port],
      ssl: sslnegotiation ? { rejectUnauthorized: false } : false,
      sslnegotiation,
      enableChannelBinding: true,
      targetSessionAttrs: sslnegotiation ? 'read-write' : 'any',
      connectionTimeoutMillis: 2000,
    })
    try {
      await client.connect()
      assert.strictEqual(client.host, helper.config.host)
      assert.strictEqual(client.port, Number(helper.config.port))
      assert.deepStrictEqual(
        (await client.query({ name: 'multihost', text: 'SELECT $1::int AS value', values: [1] })).rows,
        [{ value: 1 }]
      )
      assert.deepStrictEqual((await client.query({ name: 'multihost', values: [2] })).rows, [{ value: 2 }])
      serverVersion = Number((await client.query('SHOW server_version_num')).rows[0].server_version_num)
      if (sslnegotiation) assert.strictEqual(client.connection.stream.encrypted, true)
      if (sslnegotiation === 'direct') assert.strictEqual(client.connection.stream.alpnProtocol, 'postgresql')
    } finally {
      await client.end()
    }
  }
})

suite.test('session checks accept and reject the real backend', async () => {
  for (const [targetSessionAttrs, readOnly, accepted] of [
    ['primary', false, true],
    ['standby', false, false],
    ['read-only', true, true],
    ['read-only', false, false],
    ['read-write', true, false],
  ]) {
    const client = new Client({
      ...helper.config,
      options: '-c default_transaction_read_only=' + (readOnly ? 'on' : 'off'),
      targetSessionAttrs,
    })
    try {
      if (accepted) {
        await client.connect()
        assert.strictEqual(
          (await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,
          readOnly ? 'on' : 'off'
        )
      } else {
        await assert.rejects(
          client.connect(),
          new RegExp('None of the hosts satisfy target_session_attrs="' + targetSessionAttrs + '"')
        )
      }
    } finally {
      await client.end()
    }
  }
})

suite.test('prefer-standby makes a second pass from the first host', async () => {
  let attempts = 0
  const client = new Client({
    ...helper.config,
    host: [helper.config.host, helper.config.host],
    targetSessionAttrs: 'prefer-standby',
    stream: () => {
      attempts++
      return new net.Socket()
    },
  })
  try {
    await client.connect()
    assert.strictEqual(attempts, 3)
    assert.deepStrictEqual((await client.query('SELECT 1 AS value')).rows, [{ value: 1 }])
  } finally {
    await client.end()
  }
})

suite.test('a startup error stops host selection', async () => {
  let attempts = 0
  const client = new Client({
    ...helper.config,
    host: [helper.config.host, helper.config.host],
    database: 'node_postgres_multihost_database_that_does_not_exist',
    stream: () => {
      attempts++
      return new net.Socket()
    },
  })
  try {
    await assert.rejects(client.connect(), { code: '3D000' })
    assert.strictEqual(attempts, 1)
  } finally {
    await client.end()
  }
})

suite.test('pool queries work after skipping an unavailable Unix socket', async () => {
  const pool = new Pool({
    ...helper.config,
    host: ['/node-postgres-multihost-missing', helper.config.host],
    targetSessionAttrs: 'read-write',
    max: 1,
  })
  try {
    assert.deepStrictEqual((await pool.query('SELECT 1 AS value')).rows, [{ value: 1 }])
    assert.deepStrictEqual((await pool.query('SELECT 2 AS value')).rows, [{ value: 2 }])
  } finally {
    await pool.end()
  }
})
