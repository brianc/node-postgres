var assert = require('assert')
var Cursor = require('../')
var pg = require('pg.js')

var text = 'SELECT generate_series as num FROM generate_series(0, 50)'
describe('close', function() {
  beforeEach(function(done) {
    var client = this.client = new pg.Client()
    client.connect(done)
    client.on('drain', client.end.bind(client))
  })

  it('closes cursor early', function(done) {
    var cursor = new Cursor(text)
    this.client.query(cursor)
    this.client.query('SELECT NOW()', done)
    cursor.read(25, function(err, res) {
      assert.ifError(err)
      cursor.close()
    })
  })

  it('works with callback style', function(done) {
    var cursor = new Cursor(text)
    var client = this.client
    client.query(cursor)
    cursor.read(25, function(err, res) {
      assert.ifError(err)
      cursor.close(function(err) {
        assert.ifError(err)
        client.query('SELECT NOW()', done)
      })
    })
  })
})
