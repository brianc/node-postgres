'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()
const pgpass = require('pgpass')

class Wait {
  constructor() {
    this.promise = new Promise((resolve) => {
      this.resolve = resolve
    })
  }

  until() {
    return this.promise
  }

  done(time) {
    if (time) {
      setTimeout(this.resolve.bind(this), time)
    } else {
      this.resolve()
    }
  }
}

suite.test('password callback is called with conenction params', async function () {
  const wait = new Wait()
  const client = helper.client({
    user: 'foo',
    database: 'bar',
    host: 'baz',
    password: async () => {
      wait.done(1)
      return 'password'
    },
  })
  client.connection.emit('authenticationCleartextPassword')
  await wait.until()
  assert.equal(client.user, 'foo')
  assert.equal(client.database, 'bar')
  assert.equal(client.host, 'baz')
  assert.equal(client.connectionParameters.password, 'password')
})

suite.test('cleartext password auth does not crash with null password using pg-pass', async function () {
  process.env.PGPASSFILE = `${__dirname}/pgpass.file`
  const wait = new Wait()
  const client = helper.client({
    host: 'foo',
    port: 5432,
    database: 'bar',
    user: 'baz',
    password: (params) => {
      return new Promise((resolve) => {
        pgpass(params, (pass) => {
          wait.done(1)
          resolve(pass)
        })
      })
    },
  })
  client.connection.emit('authenticationCleartextPassword')
  await wait.until()
  assert.equal(client.password, 'quz')
})
