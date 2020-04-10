'use strict'
const helper = require('./../test-helper')
const assert = require('assert')
const util = require('util')

const suite = new helper.Suite()

const password = 'FAIL THIS TEST'

suite.test('Password should not exist in toString() output', () => {
  const pool = new helper.pg.Pool({ password })
  const client = new helper.pg.Client({ password })
  assert(pool.toString().indexOf(password) === -1)
  assert(client.toString().indexOf(password) === -1)
})

suite.test('Password should not exist in util.inspect output', () => {
  const pool = new helper.pg.Pool({ password })
  const client = new helper.pg.Client({ password })
  const depth = 20
  assert(util.inspect(pool, { depth }).indexOf(password) === -1)
  assert(util.inspect(client, { depth }).indexOf(password) === -1)
})

suite.test('Password should not exist in json.stringfy output', () => {
  const pool = new helper.pg.Pool({ password })
  const client = new helper.pg.Client({ password })
  const depth = 20
  assert(JSON.stringify(pool).indexOf(password) === -1)
  assert(JSON.stringify(client).indexOf(password) === -1)
})
