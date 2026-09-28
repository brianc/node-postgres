const assert = require('assert')
const Cursor = require('../')
const pg = require('pg')

const text = 'SELECT generate_series as num FROM generate_series(0, 50)'
describe('close', function () {
  beforeEach(function (done) {
    const client = (this.client = new pg.Client())
    client.connect(done)
  })

  this.afterEach(function (done) {
    this.client.end(done)
  })

  it('can close a finished cursor without a callback', function (done) {
    const cursor = new Cursor(text)
    this.client.query(cursor)
    cursor.read(100, function (err) {
      assert.ifError(err)
      cursor.close()
    })
    this.client.once('drain', done)
  })

  it('can close a finished cursor a promise', function (done) {
    const cursor = new Cursor(text)
    this.client.query(cursor)
    cursor.read(100, (err) => {
      assert.ifError(err)
      cursor.close().then(() => {
        this.client.query('SELECT NOW()', done)
      })
    })
  })

  it('closes cursor early', function (done) {
    const cursor = new Cursor(text)
    this.client.query(cursor)
    cursor.read(25, function (err) {
      assert.ifError(err)
      cursor.close()
    })
    this.client.once('drain', done)
  })

  it('works with callback style', function (done) {
    const cursor = new Cursor(text)
    const client = this.client
    client.query(cursor)
    cursor.read(25, function (err, rows) {
      assert.ifError(err)
      assert.strictEqual(rows.length, 25)
      cursor.close(function (err) {
        assert.ifError(err)
        client.query('SELECT NOW()', done)
      })
    })
  })

  it('can close a cursor after a query error', async function () {
    const cursor = this.client.query(new Cursor('SELECT 1/0'))
    // Close only once the error's readyForQuery has been handled, as a caller
    // closing in a finally block after the rejection usually does.
    const drained = new Promise((resolve) => this.client.once('drain', resolve))
    await assert.rejects(cursor.read(10), /division by zero/)
    await drained
    await cursor.close()
    const result = await this.client.query('SELECT 1 AS value')
    assert.deepStrictEqual(result.rows, [{ value: 1 }])
  })

  it('can close a cursor after its connection is lost', async function () {
    const client = this.client
    client.on('error', () => {})
    const cursor = client.query(new Cursor(text))
    await cursor.read(10)
    const ended = new Promise((resolve) => client.once('end', resolve))
    const other = new pg.Client()
    await other.connect()
    try {
      await other.query('SELECT pg_terminate_backend($1)', [client.processID])
    } finally {
      await other.end()
    }
    await ended
    await cursor.close()
  })

  it('is a no-op to "close" the cursor before submitting it', function (done) {
    const cursor = new Cursor(text)
    cursor.close(done)
  })

  it('keeps the client usable after closing before the first response', async function () {
    // Let the connect callback return before submitting the cursor.
    await Promise.resolve()
    const client = this.client
    const cursor = new Cursor(text)
    const connection = client.connection
    const sync = connection.sync
    let syncCount = 0
    connection.sync = function () {
      syncCount++
      return sync.apply(this, arguments)
    }

    connection.stream.pause()
    try {
      client.query(cursor)
      assert.strictEqual(cursor.connection, connection)
      // Exhaust the portal so CommandComplete arrives after close.
      const read = cursor.read(100)
      const closed = cursor.close()
      connection.stream.resume()

      await Promise.all([read, closed])
      assert.strictEqual(syncCount, 1)
      const result = await client.query('SELECT 1 AS value')
      assert.deepStrictEqual(result.rows, [{ value: 1 }])
    } finally {
      connection.stream.resume()
      connection.sync = sync
    }
  })
})
