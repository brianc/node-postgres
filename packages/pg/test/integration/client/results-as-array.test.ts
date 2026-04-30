import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('results-as-array', () => {
  const Client = helper.Client

  const conInfo = helper.config

  it('returns results as array', function () {
    const client = new Client(conInfo)
    const checkRow = function (row: unknown[]): void {
      assert(Array.isArray(row), 'row should be an array')
      assert.equal(row.length, 4)
      assert.equal((row[0] as Date).getFullYear(), new Date().getFullYear())
      assert.strictEqual(row[1], 1)
      assert.strictEqual(row[2], 'hai')
      assert.strictEqual(row[3], null)
    }
    client.connect(
      assert.success(function () {
        const config = {
          text: 'SELECT NOW(), 1::int, $1::text, null',
          values: ['hai'],
          rowMode: 'array' as const,
        }
        client.query(
          config,
          assert.success(function (result) {
            assert.equal(result.rows.length, 1)
            checkRow(result.rows[0])
            client.end()
          })
        )
      })
    )
  })
})
