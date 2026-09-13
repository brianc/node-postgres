'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const NativeQuery = require('../../lib/native/query')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

function submitWithNativeResult(nativeCbArgs, queryCb) {
  const query = new NativeQuery({ text: 'SELECT 1', callback: queryCb })
  const client = {
    namedQueries: {},
    native: {
      arrayMode: false,
      pq: { resultErrorFields: () => null },
      query: function (text, valuesOrCb, maybeCb) {
        const cb = typeof valuesOrCb === 'function' ? valuesOrCb : maybeCb
        setImmediate(() => cb.apply(null, nativeCbArgs))
      },
    },
  }
  query.submit(client)
}

test('missing native result is an error, not success with undefined', (done) => {
  submitWithNativeResult([null, [], undefined], (err, res) => {
    assert(err instanceof Error)
    assert.strictEqual(res, undefined)
    assert.match(err.message, /without a result/)
    done()
  })
})

test('normal native result still succeeds', (done) => {
  const result = { rows: [{ n: 1 }], fields: [], command: 'SELECT', rowCount: 1 }
  submitWithNativeResult([null, result.rows, result], (err, res) => {
    assert.ifError(err)
    assert.strictEqual(res, result)
    done()
  })
})

test('native query error is still forwarded', (done) => {
  const boom = new Error('boom')
  submitWithNativeResult([boom], (err) => {
    assert.strictEqual(err, boom)
    done()
  })
})
