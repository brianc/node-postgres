'use strict'
var helper = require('./test-helper')
var Query = require('../../../lib/query')
var types = require('pg-types')
const assert = require('assert')

const suite = new helper.Suite()

var typeParserError = new TypeError('oid must be an integer: special oid that will throw')

suite.test('special oid that will throw', function (done) {
  try {
    types.setTypeParser('special oid that will throw', function () {
      throw new Error('TEST: Throw in type parsers')
    })
    assert.equal(true, false)
  } catch (err) {
    assert.equal(err.message, typeParserError.message)
  } finally {
    done()
  }
})
