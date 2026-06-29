'use strict'
const assert = require('assert')
const helper = require('../test-helper')
const ConnectionParameters = require('../../../lib/connection-parameters')

for (const key in process.env) {
  delete process.env[key]
}

const suite = new helper.Suite()

suite.test('single port as number is parsed to integer', function () {
  const subject = new ConnectionParameters({ port: 5432 })
  assert.strictEqual(subject.port, 5432)
})

suite.test('single port as string is parsed to integer', function () {
  const subject = new ConnectionParameters({ port: '5433' })
  assert.strictEqual(subject.port, 5433)
})

suite.test('port array of numbers is preserved as integer array', function () {
  const subject = new ConnectionParameters({ host: ['h1', 'h2'], port: [5432, 5433] })
  assert.deepStrictEqual(subject.port, [5432, 5433])
})

suite.test('port array of strings is mapped to integers', function () {
  const subject = new ConnectionParameters({ host: ['h1', 'h2', 'h3'], port: ['5432', '5433', '5434'] })
  assert.deepStrictEqual(subject.port, [5432, 5433, 5434])
})

suite.test('port array with single element is preserved as array', function () {
  const subject = new ConnectionParameters({ port: [5432] })
  assert.deepStrictEqual(subject.port, [5432])
})

suite.test('single host string is preserved', function () {
  const subject = new ConnectionParameters({ host: 'localhost' })
  assert.strictEqual(subject.host, 'localhost')
})

suite.test('host array is passed through unchanged', function () {
  const subject = new ConnectionParameters({ host: ['host1', 'host2', 'host3'] })
  assert.deepStrictEqual(subject.host, ['host1', 'host2', 'host3'])
})

suite.test('host array with single element is preserved as array', function () {
  const subject = new ConnectionParameters({ host: ['localhost'] })
  assert.deepStrictEqual(subject.host, ['localhost'])
})

suite.test('host and port arrays are both passed through', function () {
  const subject = new ConnectionParameters({ host: ['h1', 'h2'], port: [5432, 5433] })
  assert.deepStrictEqual(subject.host, ['h1', 'h2'])
  assert.deepStrictEqual(subject.port, [5432, 5433])
})

suite.test('scalar port with host array is valid and preserved as number', function () {
  const subject = new ConnectionParameters({ host: ['h1', 'h2', 'h3'], port: 5432 })
  assert.deepStrictEqual(subject.host, ['h1', 'h2', 'h3'])
  assert.strictEqual(subject.port, 5432)
})

suite.test('isDomainSocket is false when host is an array', function () {
  const subject = new ConnectionParameters({ host: ['/tmp/', 'localhost'] })
  assert.strictEqual(subject.isDomainSocket, false)
})

suite.test('invalid targetSessionAttrs throws', function () {
  assert.throws(
    () => new ConnectionParameters({ targetSessionAttrs: 'read-mostly' }),
    /invalid targetSessionAttrs value/
  )
})

suite.test('valid targetSessionAttrs values do not throw', function () {
  const valid = ['any', 'read-write', 'read-only', 'primary', 'standby', 'prefer-standby']
  for (const value of valid) {
    assert.doesNotThrow(() => new ConnectionParameters({ targetSessionAttrs: value }))
  }
})

suite.test('mismatched ports and hosts count throws', function () {
  assert.throws(
    () => new ConnectionParameters({ host: ['h1', 'h2', 'h3'], port: [5432, 5433] }),
    /ports must have either 1 entry/
  )
})
