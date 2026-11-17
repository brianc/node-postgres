'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

const userKey = process.platform === 'win32' ? 'USERNAME' : 'USER'
const modulePath = require.resolve('../../lib/defaults')

// load a fresh copy of lib/defaults.js while recording which environment keys are read
const loadDefaults = function (env) {
  const reads = []
  const realEnv = process.env
  const savedModule = require.cache[modulePath]
  delete require.cache[modulePath]
  process.env = new Proxy(Object.assign({}, env), {
    get(target, key) {
      reads.push(key)
      return target[key]
    },
  })
  let defaults
  try {
    defaults = require(modulePath)
  } finally {
    process.env = realEnv
    if (savedModule) {
      require.cache[modulePath] = savedModule
    } else {
      delete require.cache[modulePath]
    }
  }
  return { defaults, reads }
}

test('defaults.user', function () {
  test('is not read from the environment when the module is loaded', function () {
    const { reads } = loadDefaults({ [userKey]: 'alice' })
    assert.deepEqual(reads, [])
  })

  test('is read on first access and then stays a plain data property', function () {
    const realEnv = process.env
    const { defaults } = loadDefaults({})
    process.env = { [userKey]: 'alice' }
    try {
      assert.equal(defaults.user, 'alice')
      process.env = { [userKey]: 'bob' }
      assert.equal(defaults.user, 'alice')
    } finally {
      process.env = realEnv
    }
    assert.deepEqual(Object.getOwnPropertyDescriptor(defaults, 'user'), {
      value: 'alice',
      writable: true,
      enumerable: true,
      configurable: true,
    })
  })

  test('keeps its position in the key order', function () {
    const { defaults } = loadDefaults({})
    assert.deepEqual(Object.keys(defaults).slice(0, 3), ['host', 'user', 'database'])
  })

  test('can be assigned before it is read', function () {
    const { defaults } = loadDefaults({ [userKey]: 'alice' })
    defaults.user = 'carol'
    assert.equal(defaults.user, 'carol')
    assert.deepEqual(Object.getOwnPropertyDescriptor(defaults, 'user'), {
      value: 'carol',
      writable: true,
      enumerable: true,
      configurable: true,
    })
  })

  test('can be deleted before it is read', function () {
    const { defaults } = loadDefaults({ [userKey]: 'alice' })
    delete defaults.user
    assert.equal(defaults.user, undefined)
    assert.equal('user' in defaults, false)
  })

  test('is undefined when the environment cannot be read', function () {
    const realEnv = process.env
    const { defaults } = loadDefaults({})
    process.env = new Proxy(
      {},
      {
        get() {
          throw new Error('env access denied')
        },
      }
    )
    try {
      assert.strictEqual(defaults.user, undefined)
    } finally {
      process.env = realEnv
    }
  })
})
