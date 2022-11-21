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

    assert(await immediateRead.then(() => null, (err) => err))
    assert(await queuedRead1.then(() => null, (err) => err))
    assert(await queuedRead2.then(() => null, (err) => err))

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
})
