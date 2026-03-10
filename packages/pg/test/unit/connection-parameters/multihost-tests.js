'use strict'
const assert = require('assert')
const helper = require('../test-helper')
const ConnectionParameters = require('../../../lib/connection-parameters')

// clear process.env so defaults don't interfere
for (const key in process.env) {
  delete process.env[key]
}

const suite = new helper.Suite()

// --- port handling ---

suite.test('single port as number is parsed to integer', function () {
  const subject = new ConnectionParameters({ port: 5432 })
  assert.strictEqual(subject.port, 5432)
})

suite.test('single port as string is parsed to integer', function () {
  const subject = new ConnectionParameters({ port: '5433' })
  assert.strictEqual(subject.port, 5433)
})

suite.test('port array of numbers is preserved as integer array', function () {
  const subject = new ConnectionParameters({ port: [5432, 5433] })
  assert.deepStrictEqual(subject.port, [5432, 5433])
})

suite.test('port array of strings is mapped to integers', function () {
  const subject = new ConnectionParameters({ port: ['5432', '5433', '5434'] })
  assert.deepStrictEqual(subject.port, [5432, 5433, 5434])
})

suite.test('port array with single element is preserved as array', function () {
  const subject = new ConnectionParameters({ port: [5432] })
  assert.deepStrictEqual(subject.port, [5432])
})

// --- host handling ---

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

// --- multihost + multiport together ---

suite.test('host and port arrays are both passed through', function () {
  const subject = new ConnectionParameters({ host: ['h1', 'h2'], port: [5432, 5433] })
  assert.deepStrictEqual(subject.host, ['h1', 'h2'])
  assert.deepStrictEqual(subject.port, [5432, 5433])
})

// --- isDomainSocket must stay false for array hosts ---

suite.test('isDomainSocket is false when host is an array', function () {
  const subject = new ConnectionParameters({ host: ['/tmp/', 'localhost'] })
  assert.strictEqual(subject.isDomainSocket, false)
})
