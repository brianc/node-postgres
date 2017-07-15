'use strict'
var helper = require('./test-helper')
var co = require('co')

const pool = new helper.pg.Pool()
new helper.Suite().test('using coroutines works with promises', co.wrap(function * () {
  var client = yield pool.connect()
  var res = yield client.query('SELECT $1::text as name', ['foo'])
  assert.equal(res.rows[0].name, 'foo')

  var threw = false
  try {
    yield client.query('SELECT LKDSJDSLKFJ')
  } catch (e) {
    threw = true
  }
  assert(threw)
  client.release()
  yield pool.end()
}))
