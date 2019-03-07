'use strict'
var helper = require('./test-helper')
const suite = new helper.Suite()

suite.test('works with null character in Buffer', function (done) {
  client.query('SELECT $1::bytea as buffer', [new Buffer(1)], assert.success(function (result) {
    var array = result.rows[0].buffer
    assert.lengthIs(array, 1)
    assert.equal(array[0], 0)
    done()
  }))
});
