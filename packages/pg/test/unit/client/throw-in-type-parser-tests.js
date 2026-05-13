'use strict'
const helper = require('./test-helper')
const Query = require('../../../lib/query')
const types = require('pg-types')
const assert = require('assert')

const suite = new helper.Suite()

const typeParserError = new Error('TEST: Throw in type parsers')

types.setTypeParser('special oid that will throw', function () {
  throw typeParserError
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
  const client = helper.client()
  const con = client.connection
  const query = client.query(new Query('whatever'))
  emitFakeEvents(con)

  assert.emits(query, 'error', function (err) {
    assert.equal(err, typeParserError)
    done()
  })
})

suite.test('calls callback with error', function (done) {
  const client = helper.client()
  const con = client.connection
  emitFakeEvents(con)
  client.query('whatever', function (err) {
    assert.equal(err, typeParserError)
    done()
  })
})

suite.test('rejects promise with error', function (done) {
  const client = helper.client()
  const con = client.connection
  emitFakeEvents(con)
  client.query('whatever').catch((err) => {
    assert.equal(err, typeParserError)
    done()
  })
})
