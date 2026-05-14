'use strict'
const helper = require('../test-helper')
const pg = helper.pg

process.on('unhandledRejection', function (e) {
  console.error(e, e.stack)
  process.exit(1)
})

const suite = new helper.Suite()

suite.test('promise API async stack trace in pool', async function outerFunction() {
  async function innerFunction() {
    const pool = new pg.Pool()
    await pool.query('SELECT test from nonexistent')
  }
  try {
    await innerFunction()
    throw Error('should have errored')
  } catch (e) {
    const stack = e.stack
    if (!e.stack.includes('innerFunction') || !e.stack.includes('outerFunction')) {
      throw Error('async stack trace does not contain wanted values: ' + stack, { cause: e })
    }
  }
})

suite.test('promise API async stack trace in client', async function outerFunction() {
  async function innerFunction() {
    const client = new pg.Client()
    await client.connect()
    try {
      await client.query('SELECT test from nonexistent')
    } finally {
      client.end()
    }
  }
  try {
    await innerFunction()
    throw Error('should have errored')
  } catch (e) {
    const stack = e.stack
    if (!e.stack.includes('innerFunction') || !e.stack.includes('outerFunction')) {
      throw Error('async stack trace does not contain wanted values: ' + stack, { cause: e })
    }
  }
})
