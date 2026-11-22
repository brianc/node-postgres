'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

const Query = require('../../lib/query')
const NativeQuery = require('../../lib/native/query')

for (const [label, QueryClass] of [
  ['Query', Query],
  ['NativeQuery', NativeQuery],
]) {
  test(`${label} reads text, values and callback like normalizeQueryConfig`, function () {
    const callback = function () {}
    const other = function () {}
    let query

    query = new QueryClass('TEXT')
    assert.equal(query.text, 'TEXT')
    assert.equal(query.values, undefined)
    assert.equal(query.callback, undefined)

    query = new QueryClass('TEXT', [10], callback)
    assert.equal(query.text, 'TEXT')
    assert.deepEqual(query.values, [10])
    assert.equal(query.callback, callback)

    query = new QueryClass({ text: 'TEXT', values: [10] })
    assert.deepEqual(query.values, [10])

    query = new QueryClass({ text: 'TEXT', values: [10] }, [20])
    assert.deepEqual(query.values, [20])

    query = new QueryClass({ text: 'TEXT', values: [10] }, callback)
    assert.deepEqual(query.values, [10])
    assert.equal(query.callback, callback)

    query = new QueryClass({ text: 'TEXT', callback: other })
    assert.equal(query.callback, other)

    query = new QueryClass({ text: 'TEXT', callback: other }, callback)
    assert.equal(query.callback, callback)

    query = new QueryClass({ text: 'TEXT' }, other, callback)
    assert.equal(query.values, undefined)
    assert.equal(query.callback, callback)
  })

  test(`${label} does not copy or change the caller's config`, function () {
    const callback = function () {}
    const config = Object.freeze({ text: 'TEXT', rowMode: 'array' })

    const query = new QueryClass(config, [10], callback)

    assert.deepEqual(config, { text: 'TEXT', rowMode: 'array' })
    assert.deepEqual(query.values, [10])
    assert.equal(query.callback, callback)
  })

  test(`${label} reads config properties through getters and prototypes`, function () {
    class QueryConfig {
      constructor() {
        this._text = 'TEXT'
      }

      get text() {
        return this._text
      }
    }

    const query = new QueryClass(new QueryConfig(), [10])
    assert.equal(query.text, 'TEXT')
    assert.deepEqual(query.values, [10])
  })
}
