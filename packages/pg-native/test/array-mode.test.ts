import assert from 'node:assert'
import { describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('client with arrayMode', () => {
  it('returns result as array', () =>
    new Promise<void>((resolve, reject) => {
      const client = new Client({ arrayMode: true })
      client.connectSync()
      client.querySync('CREATE TEMP TABLE blah(name TEXT)')
      client.querySync('INSERT INTO blah (name) VALUES ($1)', ['brian'])
      client.querySync('INSERT INTO blah (name) VALUES ($1)', ['aaron'])
      const rows = client.querySync('SELECT * FROM blah') as unknown[][]
      assert.equal(rows.length, 2)
      const row = rows[0] as unknown[]
      assert.equal(row.length, 1)
      assert.equal(row[0], 'brian')
      assert.equal((rows[1] as unknown[])[0], 'aaron')

      client.query("SELECT 'brian', null", (err, resultRows) => {
        if (err) return reject(err)
        const rs = resultRows as unknown[][]
        assert.strictEqual(rs[0]![0], 'brian')
        assert.strictEqual(rs[0]![1], null)
        client.end(() => resolve())
      })
    }))
})
