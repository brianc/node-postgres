'use strict'
const helper = require('./../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

suite.test('Native should not be enumerable', () => {
  const keys = Object.keys(helper.pg)
  assert.strictEqual(keys.indexOf('native'), -1)
})
