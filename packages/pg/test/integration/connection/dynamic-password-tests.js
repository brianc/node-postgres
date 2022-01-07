'use strict'
const assert = require('assert')
const helper = require('./../test-helper')
const suite = new helper.Suite()
const pg = require('../../../lib/index')
const Client = pg.Client

const password = process.env.PGPASSWORD || null
const user = process.env.PGUSER || null
const sleep = (millis) => new Promise((resolve) => setTimeout(resolve, millis))

if ((!password) || (!user)) {
  // skip these tests; no password will be requested
  return
}

suite.testAsync('Get password from a sync function', () => {
  let wasCalled = false
  function getPassword() {
    wasCalled = true
    return password
  }
  const client = new Client({
    password: getPassword,
  })
  return client.connect().then(() => {
    assert.ok(wasCalled, 'Our password function should have been called')
    return client.end()
  })
})

suite.testAsync('Throw error from a sync function', () => {
  let wasCalled = false
  const myError = new Error('Oops!')
  function getPassword() {
    wasCalled = true
    throw myError
  }
  const client = new Client({
    password: getPassword,
  })
  let wasThrown = false
  return client
    .connect()
    .catch((err) => {
      assert.equal(err, myError, 'Our sync error should have been thrown')
      wasThrown = true
    })
    .then(() => {
      assert.ok(wasCalled, 'Our password function should have been called')
      assert.ok(wasThrown, 'Our error should have been thrown')
      return client.end()
    })
})

suite.testAsync('Get password from a function asynchronously', () => {
  let wasCalled = false
  function getPassword() {
    wasCalled = true
    return sleep(100).then(() => password)
  }
  const client = new Client({
    password: getPassword,
  })
  return client.connect().then(() => {
    assert.ok(wasCalled, 'Our password function should have been called')
    return client.end()
  })
})

suite.testAsync('Throw error from an async function', () => {
  let wasCalled = false
  const myError = new Error('Oops!')
  function getPassword() {
    wasCalled = true
    return sleep(100).then(() => {
      throw myError
    })
  }
  const client = new Client({
    password: getPassword,
  })
  let wasThrown = false
  return client
    .connect()
    .catch((err) => {
      assert.equal(err, myError, 'Our async error should have been thrown')
      wasThrown = true
    })
    .then(() => {
      assert.ok(wasCalled, 'Our password function should have been called')
      assert.ok(wasThrown, 'Our error should have been thrown')
      return client.end()
    })
})

suite.testAsync('Password function must return a string', () => {
  let wasCalled = false
  function getPassword() {
    wasCalled = true
    // Return a password that is not a string
    return 12345
  }
  const client = new Client({
    password: getPassword,
  })
  let wasThrown = false
  return client
    .connect()
    .catch((err) => {
      assert.ok(err instanceof TypeError, 'A TypeError should have been thrown')
      assert.equal(err.message, 'Password must be a string')
      wasThrown = true
    })
    .then(() => {
      assert.ok(wasCalled, 'Our password function should have been called')
      assert.ok(wasThrown, 'Our error should have been thrown')
      return client.end()
    })
})

suite.testAsync('Get user from a sync function', () => {
  let wasCalled = false
  function getUser() {
    wasCalled = true
    return user
  }
  const client = new Client({
    user: getUser
  })
  return client.connect().then( async () => {
    assert.ok(wasCalled, 'Our user function should have been called')
    return client.end()
  })
})

suite.testAsync('Throw error from user sync function', () => {
  let wasCalled = false
  const myError = new Error('Oops!')
  function getUser() {
    wasCalled = true
    throw myError
  }
  const client = new Client({
    user: getUser,
  })
  let wasThrown = false
  return client
    .connect()
    .catch((err) => {
      assert.equal(err, myError, 'Our sync error should have been thrown')
      wasThrown = true
    })
    .then(() => {
      assert.ok(wasCalled, 'Our user function should have been called')
      assert.ok(wasThrown, 'Our error should have been thrown')
      return client.end()
    })
})

suite.testAsync('Get user from a function asynchronously', () => {
  let wasCalled = false
  function getUser() {
    wasCalled = true
    return sleep(100).then(() => user)
  }
  const client = new Client({
    user: getUser,
  })
  return client.connect().then(() => {
    assert.ok(wasCalled, 'Our user function should have been called')
    return client.end()
  })
})

suite.testAsync('Throw error from async user function', () => {
  let wasCalled = false
  const myError = new Error('Oops!')
  function getUser() {
    wasCalled = true
    return sleep(100).then(() => {
      throw myError
    })
  }
  const client = new Client({
    user: getUser,
  })
  let wasThrown = false
  return client
    .connect()
    .catch((err) => {
      assert.equal(err, myError, 'Our async error should have been thrown')
      wasThrown = true
    })
    .then(() => {
      assert.ok(wasCalled, 'Our user function should have been called')
      assert.ok(wasThrown, 'Our error should have been thrown')
      return client.end()
    })
})

suite.testAsync('User function must return a string', () => {
  let wasCalled = false
  function getUser() {
    wasCalled = true
    // Return a user that is not a string
    return 12345
  }
  const client = new Client({
    user: getUser,
  })
  let wasThrown = false
  return client
    .connect()
    .catch((err) => {
      assert.ok(err instanceof TypeError, 'A TypeError should have been thrown')
      assert.equal(err.message, 'User must be a string')
      wasThrown = true
    })
    .then(() => {
      assert.ok(wasCalled, 'Our user function should have been called')
      assert.ok(wasThrown, 'Our error should have been thrown')
      return client.end()
    })
})
