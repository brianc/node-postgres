'use strict'

const assert = require('assert')
const { once } = require('events')
const { Client, MemoryStream, Suite } = require('./test-helper')

const suite = new Suite()

function makeClient(attempts, config = {}) {
  const calls = []
  const streams = []
  const factoryConfigs = []
  const client = new Client({
    host: ['first', 'second'],
    port: [5432, 5433],
    ...config,
    stream: (options) => {
      const attempt = attempts[streams.length]
      assert.ok(attempt, 'unexpected connection attempt')
      factoryConfigs.push(options)
      const stream = new MemoryStream()
      streams.push(stream)
      stream.destroy = (error) => {
        if (stream.destroyed) return
        stream.destroyed = true
        process.nextTick(() => {
          if (error) stream.emit('error', error)
          stream.emit('close')
        })
      }
      stream.end = () => stream.destroy()
      stream.connect = (port, host) => {
        calls.push({ port, host })
        const connection = client.connection
        process.nextTick(() => {
          if (attempt.error) {
            stream.emit('error', attempt.error)
            return
          }
          stream.emit('connect')
          attempt(connection, stream)
        })
      }
      return stream
    },
  })
  return { client, calls, streams, factoryConfigs }
}

function ready(params = {}) {
  return (connection) => {
    for (const [parameterName, parameterValue] of Object.entries(params)) {
      connection.emit('parameterStatus', { parameterName, parameterValue })
    }
    connection.emit('readyForQuery', { status: 'I' })
  }
}

function probe(value, error) {
  return (connection) => {
    connection.query = (text) => {
      connection.probeQuery = text
      process.nextTick(() => {
        connection.emit('rowDescription', { fields: [] })
        if (error) {
          connection.emit('errorMessage', error)
        } else {
          connection.emit('dataRow', { fields: [value == null ? null : Buffer.from(value)] })
          connection.emit('commandComplete', { text: 'SELECT 1' })
        }
        connection.emit('readyForQuery', { status: 'I' })
      })
    }
    ready()(connection)
  }
}

const refused = Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' })
const primary = { in_hot_standby: 'off', default_transaction_read_only: 'off' }
const standby = { in_hot_standby: 'on', default_transaction_read_only: 'off' }

suite.test('retries with matching ports and the same stream configuration', async () => {
  for (const canDestroy of [true, false]) {
    const { client, calls, streams, factoryConfigs } = makeClient([{ error: refused }, ready()])
    if (!canDestroy) streams[0].destroy = undefined
    await client.connect()
    assert.deepStrictEqual(calls, [
      { port: 5432, host: 'first' },
      { port: 5433, host: 'second' },
    ])
    assert.strictEqual(factoryConfigs[0], factoryConfigs[1])
    if (canDestroy) assert.ok(streams[0].destroyed)
    assert.strictEqual(client.connection.stream, streams[1])
    assert.deepStrictEqual(client.connection.submittedNamedStatements, {})
    assert.strictEqual(client.host, 'second')
    assert.strictEqual(client.connectionParameters.host, 'second')
    assert.strictEqual(client.port, 5433)
    assert.doesNotThrow(() => streams[0].emit('error', new Error('late error')))
    await client.end()
  }
})

suite.test('reuses a scalar port and handles each Unix socket path independently', async () => {
  for (const hosts of [
    ['/tmp/', 'db'],
    ['db', '/tmp/'],
  ]) {
    const { client, calls } = makeClient([{ error: refused }, ready()], { host: hosts, port: 5432 })
    await client.connect()
    assert.deepStrictEqual(
      calls,
      hosts.map((host) =>
        host.startsWith('/') ? { port: '/tmp/.s.PGSQL.5432', host: undefined } : { port: 5432, host }
      )
    )
    await client.end()
  }
})

suite.test('reports the last error once when all hosts fail', async () => {
  const lastError = new Error('last host failed')
  const { client, calls } = makeClient([{ error: refused }, { error: lastError }])
  let callbacks = 0
  let ends = 0
  client.on('end', () => ends++)
  await new Promise((resolve) =>
    client.connect((err) => {
      callbacks++
      assert.strictEqual(err, lastError)
      resolve()
    })
  )
  await new Promise(setImmediate)
  assert.strictEqual(callbacks, 1)
  assert.strictEqual(ends, 1)
  assert.strictEqual(calls.length, 2)
  await client.end()
})

suite.test('does not retry startup authentication or transport errors after TCP connect', async () => {
  for (const event of ['error', 'errorMessage']) {
    const error = new Error('startup failed')
    const { client, calls } = makeClient([(connection) => connection.emit(event, error)])
    await assert.rejects(client.connect(), (err) => err === error)
    assert.strictEqual(calls.length, 1)
    await client.end()
  }
})

for (const [target, rejected, accepted] of [
  ['read-write', standby, primary],
  ['read-write', { ...primary, default_transaction_read_only: 'on' }, primary],
  ['read-only', primary, standby],
  ['primary', standby, primary],
  ['standby', primary, standby],
  ['prefer-standby', primary, standby],
]) {
  suite.test('selects the matching host for ' + target, async () => {
    const { client, calls } = makeClient([ready(rejected), ready(accepted)], { targetSessionAttrs: target })
    let connects = 0
    client.on('connect', () => connects++)
    await client.connect()
    assert.strictEqual(calls.length, 2)
    assert.strictEqual(connects, 1)
    await client.end()
  })
}

suite.test('prefer-standby also retries after transport failures in the first pass', async () => {
  const { client, calls } = makeClient([{ error: refused }, { error: refused }, ready()], {
    targetSessionAttrs: 'prefer-standby',
  })
  await client.connect()
  assert.deepStrictEqual(
    calls.map((call) => call.host),
    ['first', 'second', 'first']
  )
  await client.end()
})

for (const [target, value, query] of [
  ['read-write', 'off', 'SHOW transaction_read_only'],
  ['read-only', 'on', 'SHOW transaction_read_only'],
  ['primary', 'f', 'SELECT pg_catalog.pg_is_in_recovery()'],
  ['standby', 't', 'SELECT pg_catalog.pg_is_in_recovery()'],
]) {
  suite.test('probes missing parameters for ' + target, async () => {
    const { client } = makeClient([probe(value)], { host: ['first'], port: [5432], targetSessionAttrs: target })
    await client.connect()
    assert.strictEqual(client.connection.probeQuery, query)
    await client.end()
  })
}

suite.test('retries rejected probes and does not retain previous backend parameters', async () => {
  for (const first of [probe('on'), probe(null), probe('invalid'), probe(null, new Error('probe denied'))]) {
    const { client, calls } = makeClient([first, probe('off')], { targetSessionAttrs: 'read-write' })
    await client.connect()
    assert.strictEqual(calls.length, 2)
    await client.end()
  }
  const { client } = makeClient([ready(standby), probe('f')], { targetSessionAttrs: 'primary' })
  await client.connect()
  assert.strictEqual(client.connection.probeQuery, 'SELECT pg_catalog.pg_is_in_recovery()')
  await client.end()
})

suite.test('times out the current attempt without starting another one', async () => {
  const { client, calls, streams } = makeClient([{ error: refused }, () => {}], {
    connectionTimeoutMillis: 20,
  })
  await assert.rejects(client.connect(), /timeout expired/)
  assert.strictEqual(calls.length, 2)
  assert.ok(streams.every((stream) => stream.destroyed))
  await client.end()
})

for (const stage of ['startup', 'probe', 'ready']) {
  suite.test('end during ' + stage + ' stops selection and settles both callbacks', async () => {
    let ended
    const { client, calls } = makeClient(
      [
        (connection, stream) => {
          stream.end = () => setImmediate(() => stream.destroy())
          const end = () => {
            ended = client.end()
          }
          if (stage === 'startup') return end()
          if (stage === 'probe') connection.query = end
          else connection.once('readyForQuery', end)
          ready()(connection)
        },
      ],
      { targetSessionAttrs: stage === 'probe' ? 'primary' : 'any' }
    )
    await assert.rejects(client.connect(), { message: 'Connection terminated' })
    await ended
    assert.strictEqual(calls.length, 1)
  })
}

suite.test('selected connection supports Sync, cancel and runtime errors', async () => {
  const { client, calls, streams } = makeClient([{ error: refused }, ready()])
  await client.connect()
  client.connection.sync()
  assert.strictEqual(client.connection._ending, false)
  const stream = new MemoryStream()
  let endpoint
  stream.connect = (port, host) => {
    endpoint = { port, host }
  }
  const canceller = new Client({ host: ['first', 'second'], port: [5432, 5433], stream })
  const query = {}
  client._activeQuery = query
  client.processID = 123
  client.secretKey = 456
  canceller.cancel(client, query)
  stream.emit('connect')
  assert.deepStrictEqual(endpoint, { port: 5433, host: 'second' })
  assert.strictEqual(stream.packets[0].readInt32BE(8), 123)
  assert.strictEqual(stream.packets[0].readInt32BE(12), 456)
  client._activeQuery = null
  const error = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' })
  const failure = once(client, 'error')
  streams[1].emit('error', error)
  assert.strictEqual((await failure)[0], error)
  assert.strictEqual(calls.length, 2)
  await client.end()
})

suite.test('a synchronous probe write failure closes the attempt', async () => {
  const failure = new Error('write failed')
  const { client, calls, streams } = makeClient(
    [
      (connection) => {
        connection.query = () => {
          throw failure
        }
        ready()(connection)
      },
    ],
    { targetSessionAttrs: 'primary' }
  )
  await assert.rejects(client.connect(), (error) => error === failure)
  assert.strictEqual(calls.length, 1)
  assert.ok(streams[0].destroyed)
  await client.end()
})

suite.test('discarded connections cannot change the selected backend or emit notices', async () => {
  let discarded
  const { client, streams } = makeClient(
    [
      (connection) => {
        discarded = connection
        ready(standby)(connection)
      },
      (connection) => {
        connection.emit('backendKeyData', { processID: 123, secretKey: 456 })
        ready(primary)(connection)
      },
    ],
    { targetSessionAttrs: 'primary' }
  )
  const notices = []
  client.on('notice', (notice) => notices.push(notice))
  await client.connect()
  assert.ok(
    streams[0].packets.some((packet) => packet[0] === 0x58),
    'rejected backend receives Terminate'
  )
  discarded.emit('backendKeyData', { processID: 999, secretKey: 999 })
  discarded.emit('notice', { message: 'late notice' })
  assert.strictEqual(client.processID, 123)
  assert.strictEqual(client.secretKey, 456)
  assert.deepStrictEqual(notices, [])
  await client.end()
})

suite.test('normalizes and validates multihost options', () => {
  assert.deepStrictEqual(new Client({ host: ['first', 'second'], port: ['5432', '5433'] }).port, [5432, 5433])
  assert.deepStrictEqual(new Client({ host: 'localhost', port: ['5432'] }).port, [5432])
  assert.throws(() => new Client({ host: [] }), /host must contain at least one entry/)
  for (const port of [[], [5432, 5433, 5434]]) {
    assert.throws(() => new Client({ host: ['first', 'second'], port }), /ports must have either 1 entry/)
  }
  assert.throws(() => new Client({ targetSessionAttrs: 'read-mostly' }), /invalid targetSessionAttrs value/)
})
