'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

const Result = require('../../lib/result')

test('__proto__ column name does not pollute prototype', function () {
  const result = new Result()
  result.addFields([
    { name: '__proto__', dataTypeID: 25, format: 'text' },
    { name: 'id', dataTypeID: 23, format: 'text' },
  ])
  const row = result.parseRow(['malicious', '1'])

  // __proto__ should be a regular property, not affect prototype chain
  assert.strictEqual(row['__proto__'], 'malicious')
  assert.strictEqual(row.id, 1)

  // global Object.prototype should not be affected
  assert.strictEqual({}.malicious, undefined)
  assert.strictEqual(Object.prototype.malicious, undefined)
})

test('__proto__ column with object value does not inject prototype', function () {
  // custom type parser that returns objects (like JSON)
  const customTypes = {
    getTypeParser: () => (val) => JSON.parse(val),
  }
  const result = new Result('object', customTypes)
  result.addFields([
    { name: '__proto__', dataTypeID: 114, format: 'text' },
    { name: 'id', dataTypeID: 23, format: 'text' },
  ])

  const maliciousPayload = JSON.stringify({ isAdmin: true, role: 'admin' })
  const row = result.parseRow([maliciousPayload, '1'])

  // __proto__ should be stored as a regular property
  assert.deepStrictEqual(row['__proto__'], { isAdmin: true, role: 'admin' })

  // the row should NOT inherit from the malicious payload
  assert.strictEqual('isAdmin' in row, false)
  assert.strictEqual('role' in row, false)
})

test('constructor column name is safely stored as property', function () {
  const result = new Result()
  result.addFields([
    { name: 'constructor', dataTypeID: 25, format: 'text' },
    { name: 'id', dataTypeID: 23, format: 'text' },
  ])
  const row = result.parseRow(['malicious', '1'])

  assert.strictEqual(row.constructor, 'malicious')
  assert.strictEqual(row.id, 1)
})

test('hasOwnProperty column name is safely stored as property', function () {
  const result = new Result()
  result.addFields([
    { name: 'hasOwnProperty', dataTypeID: 25, format: 'text' },
    { name: 'data', dataTypeID: 25, format: 'text' },
  ])
  const row = result.parseRow(['not_a_function', 'value'])

  assert.strictEqual(row.hasOwnProperty, 'not_a_function')
  assert.strictEqual(row.data, 'value')

  // can still check properties using Object.prototype.hasOwnProperty.call
  assert.strictEqual(Object.prototype.hasOwnProperty.call(row, 'data'), true)
})

test('toString column name is safely stored as property', function () {
  const result = new Result()
  result.addFields([{ name: 'toString', dataTypeID: 25, format: 'text' }])
  const row = result.parseRow(['not_a_function'])

  assert.strictEqual(row.toString, 'not_a_function')
})

test('prototype column name is safely stored as property', function () {
  const result = new Result()
  result.addFields([
    { name: 'prototype', dataTypeID: 25, format: 'text' },
    { name: 'id', dataTypeID: 23, format: 'text' },
  ])
  const row = result.parseRow(['value', '1'])

  assert.strictEqual(row.prototype, 'value')
  assert.strictEqual(row.id, 1)
})

test('multiple dangerous column names handled safely', function () {
  const result = new Result()
  result.addFields([
    { name: '__proto__', dataTypeID: 25, format: 'text' },
    { name: 'constructor', dataTypeID: 25, format: 'text' },
    { name: 'prototype', dataTypeID: 25, format: 'text' },
    { name: '__defineGetter__', dataTypeID: 25, format: 'text' },
    { name: 'id', dataTypeID: 23, format: 'text' },
  ])
  const row = result.parseRow(['a', 'b', 'c', 'd', '1'])

  assert.strictEqual(row['__proto__'], 'a')
  assert.strictEqual(row.constructor, 'b')
  assert.strictEqual(row.prototype, 'c')
  assert.strictEqual(row['__defineGetter__'], 'd')
  assert.strictEqual(row.id, 1)
})

test('array rows do not build the prebuilt row object', function () {
  const result = new Result('array')
  result.addFields([
    { name: 'id', dataTypeID: 23, format: 'text' },
    { name: 'name', dataTypeID: 25, format: 'text' },
  ])

  assert.strictEqual(result._prebuiltEmptyResultObject, null)
  assert.deepStrictEqual(result.parseRow(['1', 'a']), [1, 'a'])
  assert.deepStrictEqual(result.parseRow([null, 'b']), [null, 'b'])

  // a later result set replaces the parsers
  result.addFields([{ name: 'ok', dataTypeID: 16, format: 'text' }])
  assert.strictEqual(result._prebuiltEmptyResultObject, null)
  assert.deepStrictEqual(result.parseRow(['t']), [true])
})

test('object rows still start from the prebuilt row object', function () {
  const result = new Result()
  result.addFields([
    { name: 'id', dataTypeID: 23, format: 'text' },
    { name: 'name', dataTypeID: 25, format: 'text' },
  ])

  assert.deepStrictEqual(result._prebuiltEmptyResultObject, { id: null, name: null })
  assert.deepStrictEqual(result.parseRow(['1', null]), { id: 1, name: null })
})
