'use strict'
var helper = require('./test-helper')
var Query = require('../../../lib/query')
var types = require('pg-types')
const assert = require('assert')

const suite = new helper.Suite()

var typeParserError = new TypeError('oid must be an integer: special oid that will throw')

suite.test('special oid that will throw', function (done) {
  try {
    types.setTypeParser('special oid that will throw', function () {
      throw new Error('TEST: Throw in type parsers')
    })
    assert.equal(true, false)
  } catch (err) {
    assert.equal(err, typeParserError)
  } finally {
    done()
  }
})

const emitFakeEvents = (con) => {
  setImmediate(() => {
    con.emit('readyForQuery')

    con.emit('rowDescription', {
      fields: [
        {
          name: 'boom',
          dataTypeID: 'special oid that will throw',
        },
      ],
    })

    con.emit('dataRow', { fields: ['hi'] })
    con.emit('dataRow', { fields: ['hi'] })
    con.emit('commandComplete', { text: 'INSERT 31 1' })
    con.emit('readyForQuery')
  })
}

suite.test('emits error', function (done) {
  var client = helper.client()
  var con = client.connection
  var query = client.query(new Query('whatever'))
  emitFakeEvents(con)

  assert.emits(query, 'error', function (err) {
    assert.equal(err, typeParserError)
    done()
  })
})

suite.test('calls callback with error', function (done) {
  var client = helper.client()
  var con = client.connection
  emitFakeEvents(con)
  client.query('whatever', function (err) {
    assert.equal(err, typeParserError)
    done()
  })
})

suite.test('rejects promise with error', function (done) {
  var client = helper.client()
  var con = client.connection
  emitFakeEvents(con)
  client.query('whatever').catch((err) => {
    assert.equal(err, typeParserError)
    done()
  })
})
