const assert = require('assert')
const Cursor = require('../')
const pg = require('pg')

const text = 'SELECT generate_series as num FROM generate_series(0, 5)'

describe('cursor using promises', function () {
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

  it('resolve with result', function (done) {
    const cursor = this.pgCursor(text)
    cursor
      .read(6)
      .then((res) => assert.strictEqual(res.length, 6))
      .error((err) => assert.ifError(err))
      .finally(() => done())
  })

  it('reject with error', function (done) {
    const cursor = this.pgCursor('select asdfasdf')
    cursor.read(1).error((err) => {
      assert(err)
      done()
    })
  })

  it('read multiple times', async function (done) {
    const cursor = this.pgCursor(text)
    let res

    try {
      res = await cursor.read(2)
      assert.strictEqual(res.length, 2)

      res = await cursor.read(3)
      assert.strictEqual(res.length, 3)

      res = await cursor.read(1)
      assert.strictEqual(res.length, 1)

      res = await cursor.read(1)
      assert.strictEqual(res.length, 0)
    } catch (err) {
      assert.ifError(err)
    } finally {
      done()
    }
  })
})
