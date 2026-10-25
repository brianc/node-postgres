const assert = require('assert')
const Cursor = require('../')
const pg = require('pg')

const text = 'SELECT generate_series AS num FROM generate_series(1, 5)'

describe('concurrent reads', function () {
  beforeEach(function (done) {
    const client = (this.client = new pg.Client())
    client.connect(done)
  })

  afterEach(function () {
    this.client.end()
  })

  it('settles every read when two reads overlap', async function () {
    const cursor = this.client.query(new Cursor(text))
    const first = cursor.read(1)
    const second = cursor.read(1)
    const [rowsA, rowsB] = await Promise.all([first, second])
    assert.strictEqual(rowsA.length, 1)
    assert.strictEqual(rowsB.length, 1)
    assert.strictEqual(rowsA[0].num, 1)
    assert.strictEqual(rowsB[0].num, 2)
    const rest = await cursor.read(10)
    assert.deepStrictEqual(
      rest.map((row) => row.num),
      [3, 4, 5]
    )
    await cursor.close()
  })
})
