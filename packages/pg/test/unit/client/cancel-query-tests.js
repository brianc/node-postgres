'use strict'

const assert = require('assert')
const helper = require('./test-helper')
const { cancelQuery } = require('../../../lib')

const suite = new helper.Suite()
const test = suite.test.bind(suite)

function connectedClient() {
  const client = helper.client()
  client.connection.emit('readyForQuery', { status: 'I' })
  return client
}

test('returns false without an active query', async () => {
  const client = connectedClient()
  assert.strictEqual(await cancelQuery(client), false)
})

test('shares one cancellation and holds the next query until ready and cancel EOF', async () => {
  const client = connectedClient()
  let finishCancel
  let cancelCalls = 0
  client.connection.cancelWithClone = () => {
    cancelCalls++
    return new Promise((resolve) => {
      finishCancel = resolve
    })
  }

  const first = client.query('SELECT 1')
  const firstCancel = cancelQuery(client)
  const duplicateCancel = cancelQuery(client)
  assert.strictEqual(firstCancel, duplicateCancel)
  assert.strictEqual(cancelCalls, 1)

  const second = client.query('SELECT 2')
  client.connection.emit('readyForQuery', { status: 'I' })
  await first
  assert.deepStrictEqual(client.connection.queries, ['SELECT 1'])

  finishCancel()
  assert.strictEqual(await firstCancel, true)
  assert.deepStrictEqual(client.connection.queries, ['SELECT 1', 'SELECT 2'])

  client.connection.emit('readyForQuery', { status: 'I' })
  await second
})

test('rejects an already-aborted query without submitting it', async () => {
  const client = connectedClient()
  const controller = new AbortController()
  const reason = new Error('stop before queue')
  controller.abort(reason)

  await assert.rejects(client.query({ text: 'SELECT 1', signal: controller.signal }), (error) => error === reason)
  assert.deepStrictEqual(client.connection.queries, [])
})

test('rejects invalid signals before submitting', async () => {
  const client = connectedClient()

  await assert.rejects(client.query({ text: 'SELECT 1', signal: {} }), /must be an AbortSignal/)
  assert.deepStrictEqual(client.connection.queries, [])
})

test('removes and rejects an aborted queued query', async () => {
  const client = connectedClient()
  const first = client.query('SELECT 1')
  const controller = new AbortController()
  const reason = new Error('stop in queue')
  const queued = client.query({ text: 'SELECT 2', signal: controller.signal })

  controller.abort(reason)
  await assert.rejects(queued, (error) => error === reason)
  assert.deepStrictEqual(client.connection.queries, ['SELECT 1'])

  client.connection.emit('readyForQuery', { status: 'I' })
  await first
})

test('resolves deferred manual cancellation false when submit fails', async () => {
  const client = connectedClient()
  let cancelPromise
  let cancelCalls = 0
  client.connection.cancelWithClone = () => {
    cancelCalls++
    return Promise.resolve()
  }
  const submitError = new Error('submit failed')
  const queryError = new Promise((resolve) => {
    client.query({
      callback: (error) => resolve(error),
      submit() {
        cancelPromise = cancelQuery(client)
        return submitError
      },
      handleError(error) {
        this.callback(error)
      },
    })
  })

  assert.strictEqual(await cancelPromise, false)
  assert.strictEqual(await queryError, submitError)
  assert.strictEqual(cancelCalls, 0)
})

test('defers a signal fired synchronously during submit', async () => {
  const client = connectedClient()
  const controller = new AbortController()
  let cancelCalls = 0
  let insideSubmit = false
  client.connection.cancelWithClone = () => {
    assert.strictEqual(insideSubmit, false)
    cancelCalls++
    return Promise.resolve()
  }
  client.connection.query = function (text) {
    insideSubmit = true
    this.queries.push(text)
    controller.abort()
    assert.strictEqual(cancelCalls, 0)
    insideSubmit = false
  }

  const query = client.query({ text: 'SELECT 1', signal: controller.signal })
  assert.strictEqual(cancelCalls, 1)
  client.connection.emit('readyForQuery', { status: 'I' })
  await query
})

test('holds the queue when the server error and ready arrive before cancel EOF', async () => {
  const client = connectedClient()
  let finishCancel
  client.connection.cancelWithClone = () =>
    new Promise((resolve) => {
      finishCancel = resolve
    })

  const first = client.query('SELECT pg_sleep(1)')
  const cancellation = cancelQuery(client)
  const second = client.query('SELECT 2')
  const serverError = Object.assign(new Error('canceling statement due to user request'), { code: '57014' })
  client.connection.emit('errorMessage', serverError)
  client.connection.emit('readyForQuery', { status: 'I' })

  await assert.rejects(first, (error) => error === serverError)
  assert.deepStrictEqual(client.connection.queries, ['SELECT pg_sleep(1)'])
  finishCancel()
  assert.strictEqual(await cancellation, true)
  assert.deepStrictEqual(client.connection.queries, ['SELECT pg_sleep(1)', 'SELECT 2'])

  client.connection.emit('readyForQuery', { status: 'I' })
  await second
})

test('manual cancellation failure before dispatch leaves the client usable', async () => {
  const client = connectedClient()
  const failure = new Error('connect failed')
  Object.defineProperty(failure, 'cancelDispatchMayHaveStarted', { value: false })
  client.connection.cancelWithClone = () => Promise.reject(failure)

  const first = client.query('SELECT 1')
  await assert.rejects(cancelQuery(client), (error) => error === failure)
  assert.strictEqual(client._queryable, true)
  client.connection.emit('readyForQuery', { status: 'I' })
  await first

  const second = client.query('SELECT 2')
  client.connection.emit('readyForQuery', { status: 'I' })
  await second
})

test('settles cancellation when the transport throws synchronously', async () => {
  const client = connectedClient()
  const failure = new Error('stream factory failed')
  client.connection.cancelWithClone = () => {
    throw failure
  }

  const query = client.query('SELECT 1')
  await assert.rejects(cancelQuery(client), (error) => error === failure)
  assert.strictEqual(client._cancelState, null)
  client.connection.emit('readyForQuery', { status: 'I' })
  await query
})

test('settles cancellation when the original stream errors without closing', async () => {
  const client = connectedClient()
  const failure = new Error('original stream failed')
  client.connection.cancelWithClone = () => new Promise(() => {})
  client.on('error', () => {})

  const query = client.query('SELECT 1')
  const cancellation = cancelQuery(client)
  client.connection.emit('error', failure)

  await assert.rejects(cancellation, (error) => error === failure)
  await assert.rejects(query, (error) => error === failure)
  assert.strictEqual(client._cancelState, null)
})

test('signal upgrades a shared manual cancellation failure to fail closed', async () => {
  const client = connectedClient()
  const controller = new AbortController()
  const failure = new Error('cancel transport failed')
  Object.defineProperty(failure, 'cancelDispatchMayHaveStarted', { value: false })
  let rejectCancel
  let cancelCalls = 0
  client.connection.cancelWithClone = () => {
    cancelCalls++
    return new Promise((resolve, reject) => {
      rejectCancel = reject
    })
  }
  client.connection.stream = {
    destroy() {
      client.connection.emit('end')
    },
  }

  const query = client.query({ text: 'SELECT 1', signal: controller.signal })
  const manual = cancelQuery(client)
  controller.abort()
  assert.strictEqual(cancelCalls, 1)
  rejectCancel(failure)

  await assert.rejects(manual, (error) => error === failure)
  await assert.rejects(query, /Connection terminated/)
  assert.strictEqual(client._queryable, false)
})

test('removes the abort listener when a query settles', async () => {
  const client = connectedClient()
  const controller = new AbortController()
  const signal = controller.signal
  const add = signal.addEventListener.bind(signal)
  const remove = signal.removeEventListener.bind(signal)
  let listeners = 0
  signal.addEventListener = (...args) => {
    listeners++
    return add(...args)
  }
  signal.removeEventListener = (...args) => {
    listeners--
    return remove(...args)
  }

  const query = client.query({ text: 'SELECT 1', signal })
  assert.strictEqual(listeners, 1)
  client.connection.emit('readyForQuery', { status: 'I' })
  await query
  assert.strictEqual(listeners, 0)
})

test('rejects signal queries in pipeline mode before submit', async () => {
  const client = helper.client({ pipeline: true })
  client.connection.emit('readyForQuery', { status: 'I' })
  const controller = new AbortController()

  await assert.rejects(
    client.query({ text: 'SELECT 1', signal: controller.signal }),
    /AbortSignal is not supported in pipeline mode/
  )
  assert.deepStrictEqual(client.connection.queries, [])
})
