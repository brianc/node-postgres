'use strict'
var helper = require('./test-helper')
var pg = helper.pg
const suite = new helper.Suite()
const pool = new pg.Pool()

suite.test('can access results when no rows are returned', function (done) {
  var checkResult = function (result) {
    assert(result.fields, 'should have fields definition')
    assert.equal(result.fields.length, 1)
    assert.equal(result.fields[0].name, 'val')
    assert.equal(result.fields[0].dataTypeID, 25)
  }

  pool.connect(
    assert.success(function (client, release) {
      const q = new pg.Query('select $1::text as val limit 0', ['hi'])
      var query = client.query(q, assert.success(function (result) {
        checkResult(result)
        release()
        pool.end(done)
      })
      )

      assert.emits(query, 'end', checkResult)
    })
  )
})
