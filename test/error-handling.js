'use strict'
var assert = require('assert')
var Cursor = require('../')
var pg = require('pg')

var text = 'SELECT generate_series as num FROM generate_series(0, 4)'

describe('error handling', function () {
  it('can continue after error', function (done) {
    var client = new pg.Client()
    client.connect()
    var cursor = client.query(new Cursor('asdfdffsdf'))
    cursor.read(1, function (err) {
      assert(err)
      client.query('SELECT NOW()', function (err, res) {
        assert.ifError(err)
        client.end()
        done()
      })
    })
  })
})

describe('read callback does not fire sync', () => {
  it('does not fire error callback sync', (done) => {
    var client = new pg.Client()
    client.connect()
    var cursor = client.query(new Cursor('asdfdffsdf'))
    let after = false
    cursor.read(1, function (err) {
      assert(err, 'error should be returned')
      assert.equal(after, true, 'should not call read sync')
      after = false
      cursor.read(1, function (err) {
        assert(err, 'error should be returned')
        assert.equal(after, true, 'should not call read sync')
        client.end()
        done()
      })
      after = true
    })
    after = true
  })

  it('does not fire result sync after finished', (done) => {
    var client = new pg.Client()
    client.connect()
    var cursor = client.query(new Cursor('SELECT NOW()'))
    let after = false
    cursor.read(1, function (err) {
      assert(!err)
      assert.equal(after, true, 'should not call read sync')
      cursor.read(1, function (err) {
        assert(!err)
        after = false
        cursor.read(1, function (err) {
          assert(!err)
          assert.equal(after, true, 'should not call read sync')
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
    var client = new pg.Client()
    client.connect()
    var cursor1 = client.query(new Cursor(text))
    cursor1.read(8, function (err, rows) {
      assert.ifError(err)
      assert.equal(rows.length, 5)
      var cursor2 = client.query(new Cursor(text))
      cursor2.read(8, function (err, rows) {
        assert.ifError(err)
        assert.equal(rows.length, 5)
        client.end()
        done()
      })
    })
  })
})
