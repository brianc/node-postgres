import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'
import assert from 'node:assert'

describe('199', () => {
  it('199', async () => {
    const client = helper.client()

    client.query('CREATE TEMP TABLE arrtest (n integer, s varchar)')
    client.query("INSERT INTO arrtest VALUES (4, 'foo'), (5, 'bar'), (6, 'baz');")

    const qText =
      "SELECT \
ARRAY[1, 2, 3] AS b,\
ARRAY['xx', 'yy', 'zz'] AS c,\
ARRAY(SELECT n FROM arrtest) AS d,\
ARRAY(SELECT s FROM arrtest) AS e;"

    client.query(qText, function (err, result) {
      if (err) throw err
      const row = result.rows[0]
      for (const key in row) {
        assert.equal(typeof row[key], 'object')
        assert.equal(row[key].length, 3)
      }
      client.end()
    })
  })
})
