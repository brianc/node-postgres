const assert = require('assert')
const EventEmitter = require('events')
const Cursor = require('../')
const pg = require('pg')

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

const INT4 = { name: 'num', dataTypeID: 23 }

const pushIntRows = (cursor, values) => {
  for (const value of values) {
    cursor.handleDataRow({ fields: [String(value)] })
  }
}

const settleOrTimeout = (promise, ms = 150) =>
  Promise.race([
    promise.then((value) => ({ value })),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), ms)),
  ])

describe('read() when rowCount exceeds remaining rows (#2949)', function () {
  it('settles as soon as the portal is exhausted', async function () {
    const cursor = new Cursor('SELECT num FROM generate_series(1, 2) num')
    const connection = new TestConnection()
    cursor.submit(connection)

    const read = cursor.read(1000)
    cursor.handleRowDescription({ fields: [INT4] })
    pushIntRows(cursor, [1, 2])
    cursor.handleCommandComplete({ text: 'SELECT 2' })

    const outcome = await settleOrTimeout(read)
    assert.ok(!outcome.timeout, 'read() hung after CommandComplete when rowCount exceeded remaining rows')
    assert.deepStrictEqual(outcome.value, [{ num: 1 }, { num: 2 }])
    assert.strictEqual(cursor.state, 'done')
    assert.deepStrictEqual(connection.calls, { close: 1, execute: 1, sync: 1 })
  })

  it('returns a shorter batch when only some rows remain', async function () {
    const cursor = new Cursor('SELECT num FROM generate_series(1, 5) num')
    const connection = new TestConnection()
    cursor.submit(connection)
    cursor.handleRowDescription({ fields: [INT4] })

    const first = cursor.read(3)
    pushIntRows(cursor, [1, 2, 3])
    cursor.handlePortalSuspended()
    assert.deepStrictEqual(await first, [{ num: 1 }, { num: 2 }, { num: 3 }])

    const remaining = cursor.read(1000)
    pushIntRows(cursor, [4, 5])
    cursor.handleCommandComplete({ text: 'SELECT 5' })

    const outcome = await settleOrTimeout(remaining)
    assert.ok(!outcome.timeout, 'read() hung when fetching more rows than remained')
    assert.deepStrictEqual(outcome.value, [{ num: 4 }, { num: 5 }])
  })

  it('settles queued reads with leftover or empty rows once the portal is exhausted', async function () {
    const cursor = new Cursor('SELECT num FROM generate_series(1, 2) num')
    const connection = new TestConnection()
    cursor.submit(connection)

    const first = cursor.read(1000)
    const queued = cursor.read(1000)
    cursor.handleRowDescription({ fields: [INT4] })
    pushIntRows(cursor, [1, 2])
    cursor.handleCommandComplete({ text: 'SELECT 2' })

    const firstOutcome = await settleOrTimeout(first)
    const queuedOutcome = await settleOrTimeout(queued)
    assert.ok(!firstOutcome.timeout, 'in-flight read hung after the portal was exhausted')
    assert.ok(!queuedOutcome.timeout, 'queued read hung after the portal was exhausted')
    assert.deepStrictEqual(firstOutcome.value, [{ num: 1 }, { num: 2 }])
    assert.deepStrictEqual(queuedOutcome.value, [])
  })

  it('keeps an in-flight oversized read when row description arrives late', async function () {
    const cursor = new Cursor('SELECT num FROM generate_series(1, 2) num')
    const connection = new TestConnection()
    cursor.submit(connection)

    const first = cursor.read(1000)
    const queued = cursor.read(5)
    cursor.handleRowDescription({ fields: [INT4] })
    pushIntRows(cursor, [1, 2])
    cursor.handleCommandComplete({ text: 'SELECT 2' })

    const firstOutcome = await settleOrTimeout(first)
    const queuedOutcome = await settleOrTimeout(queued)
    assert.ok(!firstOutcome.timeout, 'in-flight read was overwritten when row description arrived')
    assert.ok(!queuedOutcome.timeout, 'queued read hung after a late row description')
    assert.deepStrictEqual(firstOutcome.value, [{ num: 1 }, { num: 2 }])
    assert.deepStrictEqual(queuedOutcome.value, [])
    assert.strictEqual(connection.calls.execute, 1)
  })
})

describe('read() against PostgreSQL when rowCount exceeds remaining rows (#2949)', function () {
  beforeEach(function (done) {
    const client = (this.client = new pg.Client())
    client.connect(done)
  })

  afterEach(function () {
    this.client.end()
  })

  it('returns all 100 rows when asked for 1000', function (done) {
    const cursor = this.client.query(new Cursor('SELECT generate_series as num FROM generate_series(1, 100)'))
    cursor.read(1000, function (err, rows) {
      assert.ifError(err)
      assert.strictEqual(rows.length, 100)
      assert.strictEqual(rows[0].num, 1)
      assert.strictEqual(rows[99].num, 100)
      cursor.read(1000, function (err, empty) {
        assert.ifError(err)
        assert.strictEqual(empty.length, 0)
        done()
      })
    })
  })

  it('returns the leftover rows after a partial page', async function () {
    const cursor = this.client.query(new Cursor('SELECT generate_series as num FROM generate_series(1, 100)'))
    const first = await cursor.read(40)
    assert.strictEqual(first.length, 40)
    const remaining = await cursor.read(1000)
    assert.strictEqual(remaining.length, 60)
    assert.strictEqual(remaining[0].num, 41)
    assert.strictEqual(remaining[59].num, 100)
    assert.deepStrictEqual(await cursor.read(1000), [])
  })
})
