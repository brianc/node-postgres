'use strict'
const assert = require('assert')
const EventEmitter = require('events')
const Cursor = require('../')

const maxParameterCount = 0xffff
const errorMessage = `PostgreSQL supports a maximum of ${maxParameterCount} parameters, but ${
  maxParameterCount + 1
} were supplied`

const createConnection = function () {
  const connection = new EventEmitter()
  connection.calls = { parse: 0, bind: 0, describe: 0, flush: 0 }
  connection.parse = function () {
    connection.calls.parse++
  }
  connection.bind = function () {
    connection.calls.bind++
  }
  connection.describe = function () {
    connection.calls.describe++
  }
  connection.flush = function () {
    connection.calls.flush++
  }
  return connection
}

describe('parameter count limits', function () {
  it('allows the maximum parameter count', function () {
    const connection = createConnection()
    const cursor = new Cursor('select $1', new Array(maxParameterCount).fill(null))

    const err = cursor.submit(connection)

    assert.equal(err, undefined)
    assert.deepStrictEqual(connection.calls, { parse: 1, bind: 1, describe: 1, flush: 1 })
  })

  it('rejects too many parameters before sending query messages', function () {
    const connection = createConnection()
    const cursor = new Cursor('select $1', new Array(maxParameterCount + 1).fill(null))

    const err = cursor.submit(connection)

    assert(err instanceof RangeError)
    assert.equal(err.message, errorMessage)
    assert.deepStrictEqual(connection.calls, { parse: 0, bind: 0, describe: 0, flush: 0 })
  })
})
