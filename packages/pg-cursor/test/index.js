const assert = require('assert')
const Cursor = require('../')
const pg = require('pg')

const text = 'SELECT generate_series as num FROM generate_series(0, 5)'

describe('cursor', function () {
  beforeEach(function (done) {
    const client = (this.client = new pg.Client())
    client.connect(done)

    this.pgCursor = function (text, values) {
      return client.query(new Cursor(text, values || []))
    }
  })

  afterEach(function () {
    this.client.end()
  })

  it('fetch 6 when asking for 10', function (done) {
    const cursor = this.pgCursor(text)
    cursor.read(10, function (err, res) {
      assert.ifError(err)
      assert.strictEqual(res.length, 6)
      done()
    })
  })

  it('end before reading to end', function (done) {
    const cursor = this.pgCursor(text)
    cursor.read(3, function (err, res) {
      assert.ifError(err)
      assert.strictEqual(res.length, 3)
      done()
    })
  })

  it('callback with error', function (done) {
    const cursor = this.pgCursor('select asdfasdf')
    cursor.read(1, function (err) {
      assert(err)
      done()
    })
  })

  it('read a partial chunk of data', function (done) {
    const cursor = this.pgCursor(text)
    cursor.read(2, function (err, res) {
      assert.ifError(err)
      assert.strictEqual(res.length, 2)
      cursor.read(3, function (err, res) {
        assert(!err)
        assert.strictEqual(res.length, 3)
        cursor.read(1, function (err, res) {
          assert(!err)
          assert.strictEqual(res.length, 1)
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
    const cursor = this.pgCursor(text)
    cursor.read(2, function (err) {
      assert(!err)
      cursor.read(100, function (err, res) {
        assert(!err)
        assert.strictEqual(res.length, 4)
        cursor.read(100, function (err, res) {
          assert(!err)
          assert.strictEqual(res.length, 0)
          done()
        })
      })
    })
  })

  it('read huge result', function (done) {
    this.timeout(10000)
    const text = 'SELECT generate_series as num FROM generate_series(0, 100000)'
    const values = []
    const cursor = this.pgCursor(text, values)
    let count = 0
    const read = function () {
      cursor.read(100, function (err, rows) {
        if (err) return done(err)
        if (!rows.length) {
          assert.strictEqual(count, 100001)
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
    const text = 'SELECT $1::json me'
    const values = [{ name: 'brian' }]
    const cursor = this.pgCursor(text, values)
    cursor.read(1, function (err, rows) {
      if (err) return done(err)
      assert.strictEqual(rows[0].me.name, 'brian')
      cursor.read(1, function (err, rows) {
        assert(!err)
        assert.strictEqual(rows.length, 0)
        done()
      })
    })
  })

  it('returns result along with rows', function (done) {
    const cursor = this.pgCursor(text)
    cursor.read(1, function (err, rows, result) {
      assert.ifError(err)
      assert.strictEqual(rows.length, 1)
      assert.strictEqual(rows, result.rows)
      assert.deepStrictEqual(
        result.fields.map((f) => f.name),
        ['num']
      )
      done()
    })
  })

  it('emits row events', function (done) {
    const cursor = this.pgCursor(text)
    cursor.read(10)
    cursor.on('row', (row, result) => result.addRow(row))
    cursor.on('end', (result) => {
      assert.strictEqual(result.rows.length, 6)
      done()
    })
  })

  it('emits row events when cursor is closed manually', function (done) {
    const cursor = this.pgCursor(text)
    cursor.on('row', (row, result) => result.addRow(row))
    cursor.on('end', (result) => {
      assert.strictEqual(result.rows.length, 3)
      done()
    })

    cursor.read(3, () => cursor.close())
  })

  it('emits error events', function (done) {
    const cursor = this.pgCursor('select asdfasdf')
    cursor.on('error', function (err) {
      assert(err)
      done()
    })
  })

  it('returns rowCount on insert', function (done) {
    const pgCursor = this.pgCursor
    this.client
      .query('CREATE TEMPORARY TABLE pg_cursor_test (foo VARCHAR(1), bar VARCHAR(1))')
      .then(function () {
        const cursor = pgCursor('insert into pg_cursor_test values($1, $2)', ['a', 'b'])
        cursor.read(1, function (err, rows, result) {
          assert.ifError(err)
          assert.strictEqual(rows.length, 0)
          assert.strictEqual(result.rowCount, 1)
          done()
        })
      })
      .catch(done)
  })
})
