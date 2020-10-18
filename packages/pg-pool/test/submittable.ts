import Cursor from 'pg-cursor'
import Pool from '../'
import assert from 'assert'

describe('submittle', () => {
  //@ts-expect-error
  it('is returned from the query method', false, (done) => {
    const pool = new Pool()
    const cursor = pool.query(new Cursor('SELECT * from generate_series(0, 1000)'))

    cursor.read((err, rows) => {
      assert.strictEqual(err, undefined)
      assert.ok(rows instanceof Array)

      cursor.close(done)
    })
  })
})
