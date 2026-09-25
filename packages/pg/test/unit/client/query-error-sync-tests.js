'use strict'
const helper = require('./test-helper')
const Query = require('../../../lib/query')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('rows-mode query syncs after an error', function () {
  let syncCalls = 0
  const query = new Query({ text: 'select 1', rows: 2 }, function (err) {
    assert.equal(err.message, 'boom')
  })

  query.handleError(new Error('boom'), {
    sync: function () {
      syncCalls++
    },
  })

  assert.equal(syncCalls, 1)
})

test('normal query does not send an extra sync after an error', function () {
  let syncCalls = 0
  const query = new Query({ text: 'select 1' }, function (err) {
    assert.equal(err.message, 'boom')
  })

  query.handleError(new Error('boom'), {
    sync: function () {
      syncCalls++
    },
  })

  assert.equal(syncCalls, 0)
})
