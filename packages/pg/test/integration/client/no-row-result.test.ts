import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('no-row-result', () => {
  const pg = helper.pg
  const pool = new pg.Pool()

  it('can access results when no rows are returned', () =>
    new Promise<void>((done) => {
      const checkResult = function (result) {
        assert(result.fields, 'should have fields definition')
        assert.equal(result.fields.length, 1)
        assert.equal(result.fields[0].name, 'val')
        assert.equal(result.fields[0].dataTypeID, 25)
      }

      pool.connect(
        assert.success(function (client, release) {
          const q = new pg.Query('select $1::text as val limit 0', ['hi'])
          const query = client.query(
            q,
            assert.success(function (result) {
              checkResult(result)
              release()
              pool.end(done)
            })
          )

          assert.emits(query, 'end', checkResult)
        })
      )
    }))
})
