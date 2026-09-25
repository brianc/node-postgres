'use strict'

const assert = require('assert')
const EventEmitter = require('events')
const helper = require('./test-helper')
const { cancelQuery } = require('../../../lib')

class FakeNative extends EventEmitter {
  constructor() {
    super()
    this.pq = { resultErrorFields: () => null }
    this.queries = []
    this.cancelCallbacks = []
    FakeNative.instance = this
  }

  query(text, values, callback) {
    if (typeof values === 'function') {
      callback = values
    }
    this.queries.push({ text, callback })
    if (this.onQuery) {
      this.onQuery()
    }
  }

  cancel(callback) {
    this.cancelCallbacks.push(callback)
  }

  end(callback) {
    if (callback) {
      setImmediate(callback)
    }
  }
}

const pgNativePath = require.resolve('pg-native')
require.cache[pgNativePath] = { id: pgNativePath, filename: pgNativePath, loaded: true, exports: FakeNative }
delete require.cache[require.resolve('../../../lib/native/client')]
const NativeClient = require('../../../lib/native/client')

const suite = new helper.Suite()
const test = suite.test.bind(suite)
const tick = () => new Promise((resolve) => setImmediate(resolve))

function connectedClient(config) {
  const client = new NativeClient(config)
  client._connected = true
  return client
}

test('shares one native cancellation and holds the queue until both sides finish', async () => {
  const client = connectedClient()
  const native = FakeNative.instance
  const first = client.query('SELECT 1')
  const firstCancel = cancelQuery(client)
  const duplicateCancel = cancelQuery(client)
  const second = client.query('SELECT 2')

  assert.strictEqual(firstCancel, duplicateCancel)
  assert.strictEqual(native.cancelCallbacks.length, 1)
  native.queries[0].callback(null, [], [])
  await first
  await tick()
  assert.deepStrictEqual(
    native.queries.map((query) => query.text),
    ['SELECT 1']
  )

  native.cancelCallbacks[0]()
  assert.strictEqual(await firstCancel, true)
  assert.deepStrictEqual(
    native.queries.map((query) => query.text),
    ['SELECT 1', 'SELECT 2']
  )

  native.queries[1].callback(null, [], [])
  await second
})

test('rejects pre-aborted native work without submitting it', async () => {
  const client = connectedClient()
  const controller = new AbortController()
  const reason = 'native stop'
  controller.abort(reason)

  await assert.rejects(client.query({ text: 'SELECT 1', signal: controller.signal }), (error) => error === reason)
  assert.deepStrictEqual(FakeNative.instance.queries, [])
})

test('defers reentrant native cancellation until submit returns', async () => {
  const client = connectedClient()
  const native = FakeNative.instance
  let cancelPromise
  native.onQuery = () => {
    cancelPromise = cancelQuery(client)
    assert.strictEqual(native.cancelCallbacks.length, 0)
  }

  const query = client.query('SELECT 1')
  assert.strictEqual(native.cancelCallbacks.length, 1)
  native.cancelCallbacks[0]()
  native.queries[0].callback(null, [], [])
  await query
  assert.strictEqual(await cancelPromise, true)
})

test('settles native cancellation when libpq cancel throws synchronously', async () => {
  const client = connectedClient()
  const native = FakeNative.instance
  const failure = new Error('native cancel threw')
  native.cancel = () => {
    throw failure
  }

  const query = client.query('SELECT 1')
  await assert.rejects(cancelQuery(client), (error) => error === failure)
  assert.strictEqual(client._cancelState, null)
  native.queries[0].callback(null, [], [])
  await query
})

test('native signal upgrades a shared manual cancellation failure to fail closed', async () => {
  const client = connectedClient()
  const native = FakeNative.instance
  const controller = new AbortController()
  const query = client.query({ text: 'SELECT 1', signal: controller.signal })
  const manual = cancelQuery(client)
  controller.abort()
  assert.strictEqual(native.cancelCallbacks.length, 1)
  const failure = new Error('native cancel failed')
  native.cancelCallbacks[0](failure)

  await assert.rejects(manual, (error) => error === failure)
  await assert.rejects(query, /Connection terminated/)
  assert.strictEqual(client._queryable, false)
})

test('rejects native signal queries in pipeline mode before submit', async () => {
  const client = connectedClient({ pipeline: true })
  const controller = new AbortController()

  await assert.rejects(
    client.query({ text: 'SELECT 1', signal: controller.signal }),
    /AbortSignal is not supported in pipeline mode/
  )
  assert.deepStrictEqual(FakeNative.instance.queries, [])
})
