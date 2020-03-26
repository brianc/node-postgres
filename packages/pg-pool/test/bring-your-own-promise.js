'use strict'
const co = require('co')
const expect = require('expect.js')

const describe = require('mocha').describe
const it = require('mocha').it
const BluebirdPromise = require('bluebird')

const Pool = require('../')

const checkType = (promise, expectError) => {
  expect(promise).to.be.a(BluebirdPromise)
  return promise.catch(e => {
    if (expectError) {
      return undefined
    }
    expect().fail(e)
  })
}

describe('Bring your own promise', function () {
  it('uses supplied promise for operations', co.wrap(function * () {
    const pool = new Pool({ Promise: BluebirdPromise })
    const client1 = yield checkType(pool.connect(), false)
    client1.release()
    yield checkType(pool.query('SELECT NOW()'), false)
    const client2 = yield checkType(pool.connect(), false)
    // TODO - make sure pg supports BYOP as well
    client2.release()
    yield checkType(pool.end(), false)
  }))

  it('uses promises in errors', co.wrap(function * () {
    const pool = new Pool({ Promise: BluebirdPromise, port: 48484 })
    yield checkType(pool.connect(), true)
    yield checkType(pool.end(), true)
    yield checkType(pool.connect(), true)
    yield checkType(pool.query(), true)
    yield checkType(pool.end(), true)
  }))
})
