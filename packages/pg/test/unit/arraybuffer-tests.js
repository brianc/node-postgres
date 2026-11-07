'use strict'
const helper = require('./test-helper')
const utils = require('../../lib/utils')
const assert = require('assert')
const vm = require('vm')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('prepareValue: ArrayBuffer includes all packed views', function () {
  const value = new ArrayBuffer(12)
  new Uint8Array(value, 0, 4).set([0, 128, 255, 42])
  new Float32Array(value, 4).set([1.5, -2.5])

  const out = utils.prepareValue(value)
  assert.ok(Buffer.isBuffer(out))
  assert.deepStrictEqual(Array.from(out), Array.from(new Uint8Array(value)))
})

test('prepareValue: empty ArrayBuffer is an empty Buffer', function () {
  assert.deepStrictEqual(utils.prepareValue(new ArrayBuffer(0)), Buffer.alloc(0))
})

test('prepareValue: ArrayBuffer preserves every byte value', function () {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
  assert.deepStrictEqual(utils.prepareValue(bytes.buffer), Buffer.from(bytes))
})

test('prepareValue: ArrayBuffer from another realm is binary', function () {
  const value = vm.runInNewContext('Uint8Array.from([0, 128, 255]).buffer')
  assert.ok(!(value instanceof ArrayBuffer))
  assert.deepStrictEqual(utils.prepareValue(value), Buffer.from([0, 128, 255]))
})

test('prepareValue: custom scalar conversion can return an ArrayBuffer', function () {
  const value = {
    toPostgres: function () {
      return Uint8Array.from([0, 128, 255]).buffer
    },
  }
  assert.deepStrictEqual(utils.prepareValue(value), Buffer.from([0, 128, 255]))
})

test('prepareValue: arrays mix ArrayBuffers and bounded views', function () {
  const bytes = Uint8Array.from([0, 128, 255, 42])
  const values = [bytes.buffer, bytes.subarray(1, 3), new DataView(bytes.buffer, 2, 1), new ArrayBuffer(0)]
  assert.strictEqual(utils.prepareValue(values), '{\\\\x0080ff2a,\\\\x80ff,\\\\xff,\\\\x}')
})

test('prepareValue: nested ArrayBuffer arrays preserve nulls', function () {
  const value = vm.runInNewContext('Uint8Array.from([0, 128, 255]).buffer')
  assert.strictEqual(
    utils.prepareValue([
      [value, null],
      [new ArrayBuffer(0), undefined],
    ]),
    '{{\\\\x0080ff,NULL},{\\\\x,NULL}}'
  )
})

test('prepareValue: DataView and typed array slices keep their byte boundaries', function () {
  const bytes = Uint8Array.from([0, 1, 128, 255, 42, 43])
  assert.deepStrictEqual(utils.prepareValue(new DataView(bytes.buffer, 2, 2)), Buffer.from([128, 255]))
  assert.deepStrictEqual(utils.prepareValue(new Uint16Array(bytes.buffer, 2, 1)), Buffer.from([128, 255]))
})

test('prepareValue: ArrayBuffer lookalikes remain JSON objects', function () {
  const value = { byteLength: 3, [Symbol.toStringTag]: 'ArrayBuffer' }
  assert.strictEqual(utils.prepareValue(value), '{"byteLength":3}')
  assert.strictEqual(utils.prepareValue([value]), utils.prepareValue([{ byteLength: 3 }]))
})
