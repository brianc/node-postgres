'use strict'
const assert = require('assert')
const Cursor = require('../')
const pg = require('pg')

const text = 'SELECT generate_series as num FROM generate_series(0, 4)'

describe('error handling', function () {
  it('can continue after error', function (done) {
    const client = new pg.Client()
    client.connect()
    const cursor = client.query(new Cursor('asdfdffsdf'))
    cursor.read(1, function (err) {
      assert(err)
      client.query('SELECT NOW()', function (err) {
        assert.ifError(err)
        client.end()
        done()
      })
    })
  })

  it('errors queued reads', async () => {
    const client = new pg.Client()
    await client.connect()

    const cursor = client.query(new Cursor('asdfdffsdf'))

    const immediateRead = cursor.read(1)
    const queuedRead1 = cursor.read(1)
    const queuedRead2 = cursor.read(1)

    assert(
      await immediateRead.then(
        () => null,
        (err) => err
      )
    )
    assert(
      await queuedRead1.then(
        () => null,
        (err) => err
      )
    )
    assert(
      await queuedRead2.then(
        () => null,
        (err) => err
      )
    )

    client.end()
  })
})

describe('read callback does not fire sync', () => {
  it('does not fire error callback sync', (done) => {
    const client = new pg.Client()
    client.connect()
    const cursor = client.query(new Cursor('asdfdffsdf'))
    let after = false
    cursor.read(1, function (err) {
      assert(err, 'error should be returned')
      assert.strictEqual(after, true, 'should not call read sync')
      after = false
      cursor.read(1, function (err) {
        assert(err, 'error should be returned')
        assert.strictEqual(after, true, 'should not call read sync')
        client.end()
        done()
      })
      after = true
    })
    after = true
  })

  it('does not fire result sync after finished', (done) => {
    const client = new pg.Client()
    client.connect()
    const cursor = client.query(new Cursor('SELECT NOW()'))
    let after = false
    cursor.read(1, function (err) {
      assert(!err)
      assert.strictEqual(after, true, 'should not call read sync')
      cursor.read(1, function (err) {
        assert(!err)
        after = false
        cursor.read(1, function (err) {
          assert(!err)
          assert.strictEqual(after, true, 'should not call read sync')
          client.end()
          done()
        })
        after = true
      })
    })
    after = true
  })
})

describe('proper cleanup', function () {
  it('can issue multiple cursors on one client', function (done) {
    const client = new pg.Client()
    client.connect()
    const cursor1 = client.query(new Cursor(text))
    cursor1.read(8, function (err, rows) {
      assert.ifError(err)
      assert.strictEqual(rows.length, 5)
      const cursor2 = client.query(new Cursor(text))
      cursor2.read(8, function (err, rows) {
        assert.ifError(err)
        assert.strictEqual(rows.length, 5)
        client.end()
        done()
      })
    })
  })

  it('rejects a pending read when the error arrives after CommandComplete', async () => {
    const client = new pg.Client()
    await client.connect()
    try {
      await client.query('CREATE TEMP TABLE cursor_parent (id int PRIMARY KEY)')
      await client.query(
        'CREATE TEMP TABLE cursor_child (id int, pid int REFERENCES cursor_parent (id) DEFERRABLE INITIALLY DEFERRED)'
      )
      await client.query(
        'CREATE FUNCTION pg_temp.cursor_insert_child(i int) RETURNS int LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cursor_child VALUES (i, 999); RETURN i; END $$'
      )
      const settleWithin = (promise, ms) => {
        let timer
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve('timeout'), ms)
        })
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
      }
      const outcome = (promise) =>
        promise.then(
          () => 'rows',
          (err) => err
        )
      const cursor = client.query(new Cursor('SELECT pg_temp.cursor_insert_child(g) FROM generate_series(1, 3) g'))
      const result = await settleWithin(outcome(cursor.read(100)), 1500)
      assert.notStrictEqual(result, 'timeout', 'read never settled')
      assert.notStrictEqual(result, 'rows', 'expected the commit-time error')
      assert(result instanceof Error)
      const second = await outcome(cursor.read(100))
      assert.strictEqual(second, result, 'a later read should get the same error')
      await cursor.close()
      const { rows } = await client.query('SELECT 1 AS one')
      assert.strictEqual(rows[0].one, 1)
    } finally {
      await client.end()
    }
  })

  it('rejects queued reads when the error arrives after CommandComplete', async () => {
    const client = new pg.Client()
    await client.connect()
    try {
      await client.query('CREATE TEMP TABLE cursor_parent (id int PRIMARY KEY)')
      await client.query(
        'CREATE TEMP TABLE cursor_child (id int, pid int REFERENCES cursor_parent (id) DEFERRABLE INITIALLY DEFERRED)'
      )
      await client.query(
        'CREATE FUNCTION pg_temp.cursor_insert_child(i int) RETURNS int LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cursor_child VALUES (i, 999); RETURN i; END $$'
      )
      const settleWithin = (promise, ms) => {
        let timer
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve('timeout'), ms)
        })
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
      }
      const outcome = (promise) =>
        promise.then(
          () => 'rows',
          (err) => err
        )
      // a query ahead of the cursor keeps it in the 'initialized' state, so both reads are queued
      const blocker = client.query('SELECT 1')
      const cursor = client.query(new Cursor('SELECT pg_temp.cursor_insert_child(g) FROM generate_series(1, 3) g'))
      const r1 = outcome(cursor.read(100))
      const r2 = outcome(cursor.read(100))
      const results = await settleWithin(Promise.all([r1, r2]), 1500)
      assert.notStrictEqual(results, 'timeout', 'queued reads never settled')
      results.forEach((result) => {
        assert.notStrictEqual(result, 'rows', 'expected the commit-time error')
        assert(result instanceof Error)
      })
      await blocker
      await cursor.close()
      const { rows } = await client.query('SELECT 1 AS one')
      assert.strictEqual(rows[0].one, 1)
    } finally {
      await client.end()
    }
  })
})
