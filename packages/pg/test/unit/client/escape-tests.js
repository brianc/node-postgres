'use strict'
const helper = require('./test-helper')
const utils = require('../../../lib/utils')
const assert = require('assert')
const { Client, Suite } = helper
const suite = new Suite()
const test = suite.test.bind(suite)

const testLit = function (testName, input, expected) {
  test(testName, function () {
    const client = new Client(helper.config)
    const actual = client.escapeLiteral(input)
    assert.equal(expected, actual)
  })

  test('Client.prototype.' + testName, function () {
    const actual = Client.prototype.escapeLiteral(input)
    assert.equal(expected, actual)
  })

  test('utils.' + testName, function () {
    const actual = utils.escapeLiteral(input)
    assert.equal(expected, actual)
  })
}

const testIdent = function (testName, input, expected) {
  test(testName, function () {
    const client = new Client(helper.config)
    const actual = client.escapeIdentifier(input)
    assert.equal(expected, actual)
  })

  test('Client.prototype.' + testName, function () {
    const actual = Client.prototype.escapeIdentifier(input)
    assert.equal(expected, actual)
  })

  test('utils.' + testName, function () {
    const actual = utils.escapeIdentifier(input)
    assert.equal(expected, actual)
  })
}

testLit('escapeLiteral: no special characters', 'hello world', "'hello world'")

testLit('escapeLiteral: contains double quotes only', 'hello " world', "'hello \" world'")

testLit('escapeLiteral: contains single quotes only', "hello ' world", "'hello '' world'")

testLit('escapeLiteral: contains backslashes only', 'hello \\ world', " E'hello \\\\ world'")

testLit('escapeLiteral: contains single quotes and double quotes', 'hello \' " world', "'hello '' \" world'")

testLit('escapeLiteral: contains double quotes and backslashes', 'hello \\ " world', " E'hello \\\\ \" world'")

testLit('escapeLiteral: contains single quotes and backslashes', "hello \\ ' world", " E'hello \\\\ '' world'")

testLit(
  'escapeLiteral: contains single quotes, double quotes, and backslashes',
  'hello \\ \' " world',
  " E'hello \\\\ '' \" world'"
)

testIdent('escapeIdentifier: no special characters', 'hello world', '"hello world"')

testIdent('escapeIdentifier: contains double quotes only', 'hello " world', '"hello "" world"')

testIdent('escapeIdentifier: contains single quotes only', "hello ' world", '"hello \' world"')

testIdent('escapeIdentifier: contains backslashes only', 'hello \\ world', '"hello \\ world"')

testIdent('escapeIdentifier: contains single quotes and double quotes', 'hello \' " world', '"hello \' "" world"')

testIdent('escapeIdentifier: contains double quotes and backslashes', 'hello \\ " world', '"hello \\ "" world"')

testIdent('escapeIdentifier: contains single quotes and backslashes', "hello \\ ' world", '"hello \\ \' world"')

testIdent(
  'escapeIdentifier: contains single quotes, double quotes, and backslashes',
  'hello \\ \' " world',
  '"hello \\ \' "" world"'
)
