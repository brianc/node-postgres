const assert = require('assert')
const EventEmitter = require('events')
const Cursor = require('../')

class TestConnection extends EventEmitter {
  constructor() {
    super()
    this.calls = {
      close: 0,
      execute: 0,
      sync: 0,
    }
  }

  parse() {}
  bind() {}
  describe() {}
  flush() {}

  execute() {
    this.calls.execute++
  }

  close() {
    this.calls.close++
  }

  sync() {
    this.calls.sync++
  }
}

const submitAndCloseWithQueuedRead = () => {
  const cursor = new Cursor('select 1')
  const connection = new TestConnection()

  cursor.read(1, () => {})
  cursor.submit(connection)
  cursor.close(() => {})

  assert.strictEqual(cursor.state, 'done')
  assert.deepStrictEqual(connection.calls, { close: 1, execute: 0, sync: 1 })

  return { connection, cursor }
}

describe('messages received after close', function () {
  it('does not execute a queued read after no data', function () {
    const { connection, cursor } = submitAndCloseWithQueuedRead()

    connection.emit('noData')
    cursor.handleCommandComplete({ text: 'SELECT 0' })

    assert.strictEqual(cursor.state, 'done')
    assert.deepStrictEqual(connection.calls, { close: 1, execute: 0, sync: 1 })
  })

  it('preserves fields without executing a queued read after row description', function () {
    const { connection, cursor } = submitAndCloseWithQueuedRead()
    const fields = [{ name: 'value', dataTypeID: 23 }]

    cursor.handleRowDescription({ fields })
    cursor.handleCommandComplete({ text: 'SELECT 0' })

    assert.strictEqual(cursor.state, 'done')
    assert.strictEqual(cursor._result.fields, fields)
    assert.deepStrictEqual(connection.calls, { close: 1, execute: 0, sync: 1 })
  })

  it('delivers the active callback without reopening after portal suspended', function (done) {
    const cursor = new Cursor('select 1')
    const connection = new TestConnection()
    cursor.submit(connection)
    cursor.read(1, (err, rows, result) => {
      assert.ifError(err)
      assert.deepStrictEqual(rows, [])
      assert.strictEqual(result.rows, rows)
      assert.strictEqual(cursor.state, 'done')
      assert.deepStrictEqual(connection.calls, { close: 1, execute: 1, sync: 1 })
      done()
    })

    cursor.close(() => {})
    cursor.handlePortalSuspended()

    assert.strictEqual(cursor.state, 'done')
  })
})

describe('messages received after error', function () {
  for (const message of ['noData', 'rowDescription']) {
    it(`preserves the read error after ${message}`, async function () {
      const cursor = new Cursor('select 1')
      const connection = new TestConnection()
      const error = new Error('query failed')
      cursor.submit(connection)
      cursor.handleError(error)

      if (message === 'noData') {
        // handleError removes the listener; exercise the defensive guard directly.
        cursor._ifNoData()
      } else {
        cursor.handleRowDescription({ fields: [] })
      }

      assert.strictEqual(cursor.state, 'error')
      await assert.rejects(cursor.read(1), (err) => err === error)
      assert.deepStrictEqual(connection.calls, { close: 0, execute: 0, sync: 1 })
    })
  }
})
