import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('row-description-on-results', () => {
  const Client = helper.Client

  const conInfo = helper.config

  const checkResult = function (result) {
    assert(result.fields)
    assert.equal(result.fields.length, 3)
    const fields = result.fields
    assert.equal(fields[0].name, 'now')
    assert.equal(fields[1].name, 'num')
    assert.equal(fields[2].name, 'texty')
    assert.equal(fields[0].dataTypeID, 1184)
    assert.equal(fields[1].dataTypeID, 23)
    assert.equal(fields[2].dataTypeID, 25)
  }

  it('row descriptions on result object', function () {
    const client = new Client(conInfo)
    client.connect(
      assert.success(function () {
        client.query(
          'SELECT NOW() as now, 1::int as num, $1::text as texty',
          ['hello'],
          assert.success(function (result) {
            checkResult(result)
            client.end()
          })
        )
      })
    )
  })

  it('row description on no rows', function () {
    const client = new Client(conInfo)
    client.connect(
      assert.success(function () {
        client.query(
          'SELECT NOW() as now, 1::int as num, $1::text as texty LIMIT 0',
          ['hello'],
          assert.success(function (result) {
            checkResult(result)
            client.end()
          })
        )
      })
    )
  })
})
