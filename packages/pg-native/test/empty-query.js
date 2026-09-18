const Client = require('../')
const assert = require('assert')

describe('empty query', () => {
  it('has field metadata in result', (done) => {
    const client = new Client()
    client.connectSync()
    client.query('SELECT NOW() as now LIMIT 0', (err, rows, res) => {
      assert(!err)
      assert.equal(rows.length, 0)
      assert(Array.isArray(res.fields))
      assert.equal(res.fields.length, 1)
      client.end(done)
    })
  })

  // what pg reports too: a command without a row count and an empty query without a command
  // are null, not NaN and an empty string
  it('reports no row count and no command as null', (done) => {
    const client = new Client()
    client.connectSync()
    client.query('BEGIN', (err, rows, res) => {
      assert(!err)
      assert.strictEqual(res.command, 'BEGIN')
      assert.strictEqual(res.rowCount, null)
      client.query('', (err, rows, res) => {
        assert(!err)
        assert.strictEqual(res.command, null)
        assert.strictEqual(res.rowCount, null)
        client.end(done)
      })
    })
  })
})
