var assert = require('assert')
var pg = require('pg.js');
var Cursor = require('../');

describe('queries with no data', function () {
  beforeEach(function(done) {
    var client = this.client = new pg.Client()
    client.connect(done)
  })


  afterEach(function() {
    this.client.end()
  })

  it('handles queries that return no data', function (done) {
    var cursor = new Cursor('CREATE TEMPORARY TABLE whatwhat (thing int)')
    this.client.query(cursor)
    cursor.read(100, function (err, rows) {
      assert.ifError(err)
      assert.equal(rows.length, 0)
      done()
    })
  });
});
