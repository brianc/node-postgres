'use strict'
const assert = require('assert')
const helper = require('./test-helper')
const Result = require('../../../lib/result')
const TypeOverrides = require('../../../lib/type-overrides')

const suite = new helper.Suite()
const test = suite.test.bind(suite)

const intField = { name: 'a', dataTypeID: 23, format: 'text' }
const textField = { name: 'b', dataTypeID: 25, format: 'text' }

test('same query shape reuses the cached parser array and prebuilt row', function () {
  const types = new TypeOverrides()
  const first = new Result('', types)
  first.addFields([intField, textField])
  const second = new Result('', types)
  second.addFields([intField, textField])

  assert.strictEqual(second._parsers, first._parsers)
  assert.strictEqual(second._prebuiltEmptyResultObject, first._prebuiltEmptyResultObject)
  assert.deepStrictEqual(second.parseRow(['42', 'hi']), { a: 42, b: 'hi' })
})

test('different query shapes get their own metadata', function () {
  const types = new TypeOverrides()
  const first = new Result('', types)
  first.addFields([intField])
  const second = new Result('', types)
  second.addFields([textField])

  assert.notStrictEqual(second._parsers, first._parsers)
  assert.deepStrictEqual(first.parseRow(['1']), { a: 1 })
  assert.deepStrictEqual(second.parseRow(['1']), { b: '1' })
})

test('field name, dataTypeID and format all key the cache', function () {
  const types = new TypeOverrides()
  const first = new Result('', types)
  first.addFields([{ name: 'a', dataTypeID: 23, format: 'text' }])
  const second = new Result('', types)
  second.addFields([{ name: 'a', dataTypeID: 25, format: 'text' }])

  assert.notStrictEqual(second._parsers, first._parsers)
  assert.deepStrictEqual(first.parseRow(['7']), { a: 7 })
  assert.deepStrictEqual(second.parseRow(['7']), { a: '7' })
})

test('setTypeParser invalidates cached shapes on that instance', function () {
  const types = new TypeOverrides()
  const before = new Result('', types)
  before.addFields([intField])
  assert.deepStrictEqual(before.parseRow(['42']), { a: 42 })

  types.setTypeParser(23, 'text', (value) => `parsed:${value}`)

  const after = new Result('', types)
  after.addFields([intField])
  assert.notStrictEqual(after._parsers, before._parsers)
  assert.deepStrictEqual(after.parseRow(['42']), { a: 'parsed:42' })
})

test('global pg-types setTypeParser between queries applies to later same-shape queries', function () {
  const pgTypes = require('pg-types')
  const bigintField = { name: 'big', dataTypeID: 20, format: 'text' }
  const originalParser = pgTypes.getTypeParser(20, 'text')
  const types = new TypeOverrides()

  const before = new Result('', types)
  before.addFields([bigintField])
  assert.deepStrictEqual(before.parseRow(['1']), { big: originalParser('1') })

  pgTypes.setTypeParser(20, 'text', (value) => `G:${value}`)
  try {
    const after = new Result('', types)
    after.addFields([bigintField])
    assert.deepStrictEqual(after.parseRow(['1']), { big: 'G:1' })
  } finally {
    pgTypes.setTypeParser(20, 'text', originalParser)
  }
})

test('separate TypeOverrides instances do not share cached parsers', function () {
  const typesA = new TypeOverrides()
  typesA.setTypeParser(23, 'text', (value) => `A:${value}`)
  const typesB = new TypeOverrides()

  const resultA = new Result('', typesA)
  resultA.addFields([intField])
  const resultB = new Result('', typesB)
  resultB.addFields([intField])

  assert.deepStrictEqual(resultA.parseRow(['1']), { a: 'A:1' })
  assert.deepStrictEqual(resultB.parseRow(['1']), { a: 1 })
})

test('custom user-supplied types objects bypass the cache', function () {
  let calls = 0
  const customTypes = {
    getTypeParser() {
      calls++
      return (value) => `custom:${value}`
    },
  }

  const first = new Result('', customTypes)
  first.addFields([intField])
  const second = new Result('', customTypes)
  second.addFields([intField])

  assert.strictEqual(calls, 2)
  assert.notStrictEqual(second._parsers, first._parsers)
  assert.deepStrictEqual(second.parseRow(['1']), { a: 'custom:1' })
})

test('a TypeOverrides wrapping custom user types bypasses the cache', function () {
  let calls = 0
  const customTypes = {
    getTypeParser() {
      calls++
      return (value) => `custom:${value}`
    },
  }
  const types = new TypeOverrides(customTypes)

  const first = new Result('', types)
  first.addFields([intField])
  const second = new Result('', types)
  second.addFields([intField])

  assert.strictEqual(calls, 2)
  assert.deepStrictEqual(second.parseRow(['1']), { a: 'custom:1' })
})

test('client.setTypeParser between queries applies to later same-shape queries', function (done) {
  const client = helper.client()
  const con = client.connection

  client.query('select 1', (err, result) => {
    assert.ifError(err)
    assert.deepStrictEqual(result.rows, [{ a: 42 }])

    client.setTypeParser(23, 'text', (value) => `overridden:${value}`)

    client.query('select 1', (err2, result2) => {
      assert.ifError(err2)
      assert.deepStrictEqual(result2.rows, [{ a: 'overridden:42' }])
      done()
    })

    con.emit('rowDescription', { fields: [intField] })
    con.emit('dataRow', { fields: ['42'] })
    con.emit('commandComplete', { text: 'SELECT 1' })
    con.emit('readyForQuery')
  })

  con.emit('readyForQuery')
  con.emit('rowDescription', { fields: [intField] })
  con.emit('dataRow', { fields: ['42'] })
  con.emit('commandComplete', { text: 'SELECT 1' })
  con.emit('readyForQuery')
})
