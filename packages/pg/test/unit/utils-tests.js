'use strict'
var helper = require('./test-helper')
var utils = require('./../../lib/utils')
var defaults = require('./../../lib').defaults
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('ensure types is exported on root object', function () {
  var pg = require('../../lib')
  assert(pg.types)
  assert(pg.types.getTypeParser)
  assert(pg.types.setTypeParser)
})

test('normalizing query configs', function () {
  var config
  var callback = function () {}

  config = utils.normalizeQueryConfig({ text: 'TEXT' })
  assert.same(config, { text: 'TEXT' })

  config = utils.normalizeQueryConfig({ text: 'TEXT' }, [10])
  assert.deepEqual(config, { text: 'TEXT', values: [10] })

  config = utils.normalizeQueryConfig({ text: 'TEXT', values: [10] })
  assert.deepEqual(config, { text: 'TEXT', values: [10] })

  config = utils.normalizeQueryConfig('TEXT', [10], callback)
  assert.deepEqual(config, { text: 'TEXT', values: [10], callback: callback })

  config = utils.normalizeQueryConfig({ text: 'TEXT', values: [10] }, callback)
  assert.deepEqual(config, { text: 'TEXT', values: [10], callback: callback })
})

test('prepareValues: buffer prepared properly', function () {
  var buf = Buffer.from('quack')
  var out = utils.prepareValue(buf)
  assert.strictEqual(buf, out)
})

test('prepareValues: Uint8Array prepared properly', function () {
  var buf = new Uint8Array([1, 2, 3]).subarray(1, 2)
  var out = utils.prepareValue(buf)
  assert.ok(Buffer.isBuffer(out))
  assert.equal(out.length, 1)
  assert.deepEqual(out[0], 2)
})

test('prepareValues: date prepared properly', function () {
  helper.setTimezoneOffset(-330)

  var date = new Date(2014, 1, 1, 11, 11, 1, 7)
  var out = utils.prepareValue(date)
  assert.strictEqual(out, '2014-02-01T11:11:01.007+05:30')

  helper.resetTimezoneOffset()
})

test('prepareValues: date prepared properly as UTC', function () {
  defaults.parseInputDatesAsUTC = true

  // make a date in the local timezone that represents a specific UTC point in time
  var date = new Date(Date.UTC(2014, 1, 1, 11, 11, 1, 7))
  var out = utils.prepareValue(date)
  assert.strictEqual(out, '2014-02-01T11:11:01.007+00:00')

  defaults.parseInputDatesAsUTC = false
})

test('prepareValues: BC date prepared properly', function () {
  helper.setTimezoneOffset(-330)

  var date = new Date(-3245, 1, 1, 11, 11, 1, 7)
  var out = utils.prepareValue(date)
  assert.strictEqual(out, '3246-02-01T11:11:01.007+05:30 BC')

  helper.resetTimezoneOffset()
})

test('prepareValues: 1 BC date prepared properly', function () {
  helper.setTimezoneOffset(-330)

  // can't use the multi-argument constructor as year 0 would be interpreted as 1900
  var date = new Date('0000-02-01T11:11:01.007')
  var out = utils.prepareValue(date)
  assert.strictEqual(out, '0001-02-01T11:11:01.007+05:30 BC')

  helper.resetTimezoneOffset()
})

test('prepareValues: undefined prepared properly', function () {
  var out = utils.prepareValue(void 0)
  assert.strictEqual(out, null)
})

test('prepareValue: null prepared properly', function () {
  var out = utils.prepareValue(null)
  assert.strictEqual(out, null)
})

test('prepareValue: true prepared properly', function () {
  var out = utils.prepareValue(true)
  assert.strictEqual(out, 'true')
})

test('prepareValue: false prepared properly', function () {
  var out = utils.prepareValue(false)
  assert.strictEqual(out, 'false')
})

test('prepareValue: number prepared properly', function () {
  var out = utils.prepareValue(3.042)
  assert.strictEqual(out, '3.042')
})

test('prepareValue: string prepared properly', function () {
  var out = utils.prepareValue('big bad wolf')
  assert.strictEqual(out, 'big bad wolf')
})

test('prepareValue: simple array prepared properly', function () {
  var out = utils.prepareValue([1, null, 3, undefined, [5, 6, 'squ,awk']])
  assert.strictEqual(out, '{"1",NULL,"3",NULL,{"5","6","squ,awk"}}')
})

test('prepareValue: complex array prepared properly', function () {
  var out = utils.prepareValue([{ x: 42 }, { y: 84 }])
  assert.strictEqual(out, '{"{\\"x\\":42}","{\\"y\\":84}"}')
})

test('prepareValue: date array prepared properly', function () {
  helper.setTimezoneOffset(-330)

  var date = new Date(2014, 1, 1, 11, 11, 1, 7)
  var out = utils.prepareValue([date])
  assert.strictEqual(out, '{"2014-02-01T11:11:01.007+05:30"}')

  helper.resetTimezoneOffset()
})

test('prepareValue: arbitrary objects prepared properly', function () {
  var out = utils.prepareValue({ x: 42 })
  assert.strictEqual(out, '{"x":42}')
})

test('prepareValue: objects with simple toPostgres prepared properly', function () {
  var customType = {
    toPostgres: function () {
      return 'zomgcustom!'
    },
  }
  var out = utils.prepareValue(customType)
  assert.strictEqual(out, 'zomgcustom!')
})

test('prepareValue: buffer array prepared properly', function () {
  var buffer1 = Buffer.from('dead', 'hex')
  var buffer2 = Buffer.from('beef', 'hex')
  var out = utils.prepareValue([buffer1, buffer2])
  assert.strictEqual(out, '{\\\\xdead,\\\\xbeef}')
})

test('prepareValue: Uint8Array array prepared properly', function () {
  var buffer1 = Uint8Array.from(Buffer.from('dead', 'hex'))
  var buffer2 = Uint8Array.from(Buffer.from('beef', 'hex'))
  var out = utils.prepareValue([buffer1, buffer2])
  assert.strictEqual(out, '{\\\\xdead,\\\\xbeef}')
})

test('prepareValue: objects with complex toPostgres prepared properly', function () {
  var customType = {
    toPostgres: function () {
      return [1, 2]
    },
  }
  var out = utils.prepareValue(customType)
  assert.strictEqual(out, '{"1","2"}')
})

test('prepareValue: objects with toPostgres receive prepareValue', function () {
  var customRange = {
    lower: {
      toPostgres: function () {
        return 5
      },
    },
    upper: {
      toPostgres: function () {
        return 10
      },
    },
    toPostgres: function (prepare) {
      return '[' + prepare(this.lower) + ',' + prepare(this.upper) + ']'
    },
  }
  var out = utils.prepareValue(customRange)
  assert.strictEqual(out, '[5,10]')
})

test('prepareValue: objects with circular toPostgres rejected', function () {
  var customType = {
    toPostgres: function () {
      return {
        toPostgres: function () {
          return customType
        },
      }
    },
  }

  // can't use `assert.throws` since we need to distinguish circular reference
  // errors from call stack exceeded errors
  try {
    utils.prepareValue(customType)
  } catch (e) {
    assert.ok(e.message.match(/circular/), 'Expected circular reference error but got ' + e)
    return
  }
  throw new Error('Expected prepareValue to throw exception')
})

test('prepareValue: can safely be used to map an array of values including those with toPostgres functions', function () {
  var customType = {
    toPostgres: function () {
      return 'zomgcustom!'
    },
  }
  var values = [1, 'test', customType]
  var out = values.map(utils.prepareValue)
  assert.deepEqual(out, [1, 'test', 'zomgcustom!'])
})

var testEscapeLiteral = function (testName, input, expected) {
  test(testName, function () {
    var actual = utils.escapeLiteral(input)
    assert.equal(expected, actual)
  })
}
testEscapeLiteral('escapeLiteral: no special characters', 'hello world', "'hello world'")

testEscapeLiteral('escapeLiteral: contains double quotes only', 'hello " world', "'hello \" world'")

testEscapeLiteral('escapeLiteral: contains single quotes only', "hello ' world", "'hello '' world'")

testEscapeLiteral('escapeLiteral: contains backslashes only', 'hello \\ world', " E'hello \\\\ world'")

testEscapeLiteral('escapeLiteral: contains single quotes and double quotes', 'hello \' " world', "'hello '' \" world'")

testEscapeLiteral(
  'escapeLiteral: contains double quotes and backslashes',
  'hello \\ " world',
  " E'hello \\\\ \" world'"
)

testEscapeLiteral(
  'escapeLiteral: contains single quotes and backslashes',
  "hello \\ ' world",
  " E'hello \\\\ '' world'"
)

testEscapeLiteral(
  'escapeLiteral: contains single quotes, double quotes, and backslashes',
  'hello \\ \' " world',
  " E'hello \\\\ '' \" world'"
)

var testEscapeIdentifier = function (testName, input, expected) {
  test(testName, function () {
    var actual = utils.escapeIdentifier(input)
    assert.equal(expected, actual)
  })
}

testEscapeIdentifier('escapeIdentifier: no special characters', 'hello world', '"hello world"')

testEscapeIdentifier('escapeIdentifier: contains double quotes only', 'hello " world', '"hello "" world"')

testEscapeIdentifier('escapeIdentifier: contains single quotes only', "hello ' world", '"hello \' world"')

testEscapeIdentifier('escapeIdentifier: contains backslashes only', 'hello \\ world', '"hello \\ world"')

testEscapeIdentifier(
  'escapeIdentifier: contains single quotes and double quotes',
  'hello \' " world',
  '"hello \' "" world"'
)

testEscapeIdentifier(
  'escapeIdentifier: contains double quotes and backslashes',
  'hello \\ " world',
  '"hello \\ "" world"'
)

testEscapeIdentifier(
  'escapeIdentifier: contains single quotes and backslashes',
  "hello \\ ' world",
  '"hello \\ \' world"'
)

testEscapeIdentifier(
  'escapeIdentifier: contains single quotes, double quotes, and backslashes',
  'hello \\ \' " world',
  '"hello \\ \' "" world"'
)
