var assert = require('assert')
var Cursor = require('../')
var pg = require('pg')

var text = 'SELECT generate_series as num FROM generate_series(0, 5)'

describe('cursor', function () {
  beforeEach(function (done) {
    var client = this.client = new pg.Client()
    client.connect(done)

    this.pgCursor = function (text, values) {
      client.on('drain', client.end.bind(client))
      return client.query(new Cursor(text, values || []))
    }
  })

  afterEach(function () {
    this.client.end()
  })

  it('fetch 6 when asking for 10', function (done) {
    var cursor = this.pgCursor(text)
    cursor.read(10, function (err, res) {
      assert.ifError(err)
      assert.equal(res.length, 6)
      done()
    })
  })

  it('end before reading to end', function (done) {
    var cursor = this.pgCursor(text)
    cursor.read(3, function (err, res) {
      assert.ifError(err)
      assert.equal(res.length, 3)
      cursor.end(done)
    })
  })

  it('callback with error', function (done) {
    var cursor = this.pgCursor('select asdfasdf')
    cursor.read(1, function (err) {
      assert(err)
      done()
    })
  })

  it('read a partial chunk of data', function (done) {
    var cursor = this.pgCursor(text)
    cursor.read(2, function (err, res) {
      assert.ifError(err)
      assert.equal(res.length, 2)
      cursor.read(3, function (err, res) {
        assert(!err)
        assert.equal(res.length, 3)
        cursor.read(1, function (err, res) {
          assert(!err)
          assert.equal(res.length, 1)
          cursor.read(1, function (err, res) {
            assert(!err)
            assert.ifError(err)
            assert.strictEqual(res.length, 0)
            done()
          })
        })
      })
    })
  })

  it('read return length 0 past the end', function (done) {
    var cursor = this.pgCursor(text)
    cursor.read(2, function (err, res) {
      assert(!err)
      cursor.read(100, function (err, res) {
        assert(!err)
        assert.equal(res.length, 4)
        cursor.read(100, function (err, res) {
          assert(!err)
          assert.equal(res.length, 0)
          done()
        })
      })
    })
  })

  it('read huge result', function (done) {
    this.timeout(10000)
    var text = 'SELECT generate_series as num FROM generate_series(0, 100000)'
    var values = []
    var cursor = this.pgCursor(text, values)
    var count = 0
    var read = function () {
      cursor.read(100, function (err, rows) {
        if (err) return done(err)
        if (!rows.length) {
          assert.equal(count, 100001)
          return done()
        }
        count += rows.length
        if (count % 10000 === 0) {
          // console.log(count)
        }
        setImmediate(read)
      })
    }
    read()
  })

  it('normalizes parameter values', function (done) {
    var text = 'SELECT $1::json me'
    var values = [{ name: 'brian' }]
    var cursor = this.pgCursor(text, values)
    cursor.read(1, function (err, rows) {
      if (err) return done(err)
      assert.equal(rows[0].me.name, 'brian')
      cursor.read(1, function (err, rows) {
        assert(!err)
        assert.equal(rows.length, 0)
        done()
      })
    })
  })

  it('returns result along with rows', function (done) {
    var cursor = this.pgCursor(text)
    cursor.read(1, function (err, rows, result) {
      assert.ifError(err)
      assert.equal(rows.length, 1)
      assert.strictEqual(rows, result.rows)
      assert.deepEqual(result.fields.map(f => f.name), ['num'])
      done()
    })
  })

  it('emits row events', function (done) {
    var cursor = this.pgCursor(text)
    cursor.read(10)
    cursor.on('row', (row, result) => result.addRow(row))
    cursor.on('end', (result) => {
      assert.equal(result.rows.length, 6)
      done()
    })
  })

  it('emits row events when cursor is closed manually', function (done) {
    var cursor = this.pgCursor(text)
    cursor.on('row', (row, result) => result.addRow(row))
    cursor.on('end', (result) => {
      assert.equal(result.rows.length, 3)
      done()
    })

    cursor.read(3, () => cursor.close())
  })

  it('emits error events', function (done) {
    var cursor = this.pgCursor('select asdfasdf')
    cursor.on('error', function (err) {
      assert(err)
      done()
    })
  })
})
