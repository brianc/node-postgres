var assert = require('assert')
var Cursor = require('../')
var pg = require('pg.js')

var text = 'SELECT generate_series as num FROM generate_series(0, 4)'

describe('error handling', function() {
  it('can continue after error', function(done) {
    var client = new pg.Client()
    client.connect()
    var cursor = client.query(new Cursor('asdfdffsdf'))
    cursor.read(1, function(err) {
      assert(err)
      client.query('SELECT NOW()', function(err, res) {
        assert.ifError(err)
        client.end()
        done()
      })
    })
  })
})

describe('proper cleanup', function() {
  it('can issue multiple cursors on one client', function(done) {
    var client = new pg.Client()
    client.connect()
    var cursor1 = client.query(new Cursor(text))
    cursor1.read(8, function(err, rows) {
      assert.ifError(err)
      assert.equal(rows.length, 5)
      cursor2 = client.query(new Cursor(text))
      cursor2.read(8, function(err, rows) {
        assert.ifError(err)
        assert.equal(rows.length, 5)
        client.end()
        done()
      })
    })
  })
})
