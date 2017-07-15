'use strict'
var helper = require(__dirname + '/test-helper')

function createClient (callback) {
  var client = new Client(helper.config)
  client.connect(function (err) {
    return callback(client)
  })
}

var testLit = function (testName, input, expected) {
  test(testName, function () {
    var client = new Client(helper.config)
    var actual = client.escapeLiteral(input)
    assert.equal(expected, actual)
  })
}

var testIdent = function (testName, input, expected) {
  test(testName, function () {
    var client = new Client(helper.config)
    var actual = client.escapeIdentifier(input)
    assert.equal(expected, actual)
  })
}

testLit('escapeLiteral: no special characters',
        'hello world', "'hello world'")

testLit('escapeLiteral: contains double quotes only',
        'hello " world', "'hello \" world'")

testLit('escapeLiteral: contains single quotes only',
        'hello \' world', "'hello \'\' world'")

testLit('escapeLiteral: contains backslashes only',
        'hello \\ world', " E'hello \\\\ world'")

testLit('escapeLiteral: contains single quotes and double quotes',
        'hello \' " world', "'hello '' \" world'")

testLit('escapeLiteral: contains double quotes and backslashes',
        'hello \\ " world', " E'hello \\\\ \" world'")

testLit('escapeLiteral: contains single quotes and backslashes',
        'hello \\ \' world', " E'hello \\\\ '' world'")

testLit('escapeLiteral: contains single quotes, double quotes, and backslashes',
        'hello \\ \' " world', " E'hello \\\\ '' \" world'")

testIdent('escapeIdentifier: no special characters',
        'hello world', '"hello world"')

testIdent('escapeIdentifier: contains double quotes only',
        'hello " world', '"hello "" world"')

testIdent('escapeIdentifier: contains single quotes only',
        'hello \' world', '"hello \' world"')

testIdent('escapeIdentifier: contains backslashes only',
        'hello \\ world', '"hello \\ world"')

testIdent('escapeIdentifier: contains single quotes and double quotes',
        'hello \' " world', '"hello \' "" world"')

testIdent('escapeIdentifier: contains double quotes and backslashes',
        'hello \\ " world', '"hello \\ "" world"')

testIdent('escapeIdentifier: contains single quotes and backslashes',
        'hello \\ \' world', '"hello \\ \' world"')

testIdent('escapeIdentifier: contains single quotes, double quotes, and backslashes',
        'hello \\ \' " world', '"hello \\ \' "" world"')
