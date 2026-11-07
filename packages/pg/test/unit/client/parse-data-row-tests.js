'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const EventEmitter = require('events')
const types = require('pg-types')
const { Parser } = require('pg-protocol/dist/parser')
const Connection = require('../../../lib/connection')
const Result = require('../../../lib/result')
const buffers = require('../../test-buffers')

const suite = new helper.Suite()
const test = suite.test.bind(suite)

const INT2 = 21
const INT4 = 23
const OID = 26
const BOOL = 16
const TEXT = 25
const FLOAT8 = 701

const makeResult = (oids, rowMode, typeOverrides, ResultClass = Result) => {
  const result = new ResultClass(rowMode, typeOverrides)
  result.addFields(oids.map((oid, i) => ({ name: 'c' + i, dataTypeID: oid, format: 'text' })))
  return result
}

const parseWire = (result, values) => {
  let row
  new Parser({ lazyRows: true }).parse(buffers.dataRow(values), (msg) => {
    row = result.parseDataRow(msg)
  })
  return row
}

const assertSameAsParseRow = (oids, values) => {
  const result = makeResult(oids)
  assert.deepStrictEqual(parseWire(result, values), result.parseRow(values))
}

test('integers read from the bytes are the same as parsed from the text', function () {
  const values = ['0', '7', '-1', '2147483647', '-2147483648']
  assertSameAsParseRow(
    values.map(() => INT4),
    values
  )
  assertSameAsParseRow([INT2, INT2], ['32767', '-32768'])
  assertSameAsParseRow([OID, OID], ['0', '4294967295'])
})

test('booleans read from the bytes are the same as parsed from the text', function () {
  assertSameAsParseRow([BOOL, BOOL], ['t', 'f'])
})

test('text read from the bytes is the same as parsed from the text', function () {
  assertSameAsParseRow([TEXT, TEXT, TEXT], ['', 'wat', 'è€😀'])
})

test('null is null for every kind of column', function () {
  assertSameAsParseRow([INT4, BOOL, TEXT, FLOAT8], [null, null, null, null])
})

test('types with no shortcut use their parser', function () {
  assertSameAsParseRow([FLOAT8, INT4, TEXT], ['1.5', '2', 'x'])
})

test('a parser from setTypeParser gets the string', function () {
  const original = types.getTypeParser(INT4, 'text')
  const seen = []
  types.setTypeParser(INT4, (value) => {
    seen.push(value)
    return 'parsed'
  })
  try {
    assert.deepStrictEqual(parseWire(makeResult([INT4]), ['12']), { c0: 'parsed' })
    assert.deepStrictEqual(seen, ['12'])
  } finally {
    types.setTypeParser(INT4, original)
  }
})

test('a parser set before pg is loaded gets the string', function () {
  const path = require.resolve('../../../lib/result')
  const cached = require.cache[path]
  const original = types.getTypeParser(BOOL, 'text')
  types.setTypeParser(BOOL, (value) => 'parsed ' + value)
  delete require.cache[path]
  try {
    const row = parseWire(makeResult([BOOL], undefined, undefined, require(path)), ['t'])
    assert.deepStrictEqual(row, { c0: 'parsed t' })
  } finally {
    types.setTypeParser(BOOL, original)
    require.cache[path] = cached
  }
})

test('a text parser set before pg is loaded gets the string', function () {
  const path = require.resolve('../../../lib/result')
  const cached = require.cache[path]
  types.setTypeParser(TEXT, (value) => 'parsed ' + value)
  delete require.cache[path]
  try {
    const row = parseWire(makeResult([TEXT], undefined, undefined, require(path)), ['x'])
    assert.deepStrictEqual(row, { c0: 'parsed x' })
  } finally {
    types.setTypeParser(TEXT, types.getTypeParser(TEXT, 'unknown format'))
    require.cache[path] = cached
  }
})

test('parsers of a query override are used', function () {
  const overrides = { getTypeParser: (oid) => (oid === INT4 ? (value) => 'parsed ' + value : String) }
  assert.deepStrictEqual(parseWire(makeResult([INT4], undefined, overrides), ['12']), { c0: 'parsed 12' })
})

test('array mode returns an array', function () {
  assert.deepStrictEqual(parseWire(makeResult([INT4, TEXT], 'array'), ['12', 'x']), [12, 'x'])
})

test('a row kept by another listener does not depend on the socket buffer', function () {
  const stream = new EventEmitter()
  const con = new Connection({ stream, lazyRows: true })
  con.on('dataRow', () => {}) // The client
  let kept
  con.on('dataRow', (msg) => {
    kept = msg
  })
  con.attachListeners(stream)
  const buffer = buffers.dataRow(['kept'])
  stream.emit('data', buffer)
  buffer.fill(0)
  assert.deepStrictEqual(kept.fields, ['kept'])
})

test('a connection without a client keeps eager rows', function () {
  const stream = new EventEmitter()
  const con = new Connection({ stream })
  let kept
  con.on('dataRow', (msg) => {
    kept = msg
  })
  con.attachListeners(stream)
  const buffer = buffers.dataRow(['kept'])
  stream.emit('data', buffer)
  buffer.fill(0)
  assert.deepStrictEqual(kept.fields, ['kept'])
})
