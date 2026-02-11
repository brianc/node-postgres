'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()
const pgpass = require('pgpass')
const fs = require('fs')

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
      wait.done(10)
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
  console.log()
  console.log('hit hit hit')
  console.log('PGPASSFILE', process.env.PGPASSFILE)
  // check if file exists
  if (!fs.existsSync(process.env.PGPASSFILE)) {
    throw new Error('PGPASSFILE does not exist')
  }
  // print the contents of the file
  console.log('contents of the file:', fs.readFileSync(process.env.PGPASSFILE, 'utf8'))
  // print the mode of the file
  console.log('stats of the file:', fs.statSync(process.env.PGPASSFILE))
  const client = helper.client({
    host: 'foo',
    port: 5432,
    database: 'bar',
    user: 'baz',
    password: (params) => {
      console.log('in password callback')
      return new Promise((resolve) => {
        pgpass(params, (pass) => {
          console.log('in pgpass callback. read password:', pass)
          wait.done(10)
          resolve(pass)
        })
      })
    },
  })
  client.connection.emit('authenticationCleartextPassword')
  await wait.until()
  assert.equal(client.password, 'quz')
})
