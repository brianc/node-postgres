'use strict'
const helper = require('./test-helper')
const co = require('co')
const assert = require('assert')

const pool = new helper.pg.Pool()
new helper.Suite().test(
  'using coroutines works with promises',
  co.wrap(function* () {
    const client = yield pool.connect()
    const res = yield client.query('SELECT $1::text as name', ['foo'])
    assert.equal(res.rows[0].name, 'foo')

    let threw = false
    try {
      yield client.query('SELECT LKDSJDSLKFJ')
    } catch (e) {
      threw = true
    }
    assert(threw)
    client.release()
    yield pool.end()
  })
)
