const assert = require('assert')
const EventEmitter = require('events').EventEmitter
const types = require('pg-types')
const Client = require('../')

function stubClient(pq) {
  const client = Object.create(Client.prototype)
  EventEmitter.call(client)
  client.pq = pq
  client._types = types
  client.arrayMode = false
  client._resultCount = 0
  client._queryError = undefined
  client._results = undefined
  client._rows = undefined
  client.on('result', client._onResult.bind(client))
  return client
}

function emptyResultPq(status, errorMessage) {
  return {
    resultStatus: () => status,
    resultErrorMessage: () => errorMessage || '',
    errorMessage: () => errorMessage || '',
    cmdStatus: () => 'COPY 0',
    cmdTuples: () => '0',
    nfields: () => 0,
    ntuples: () => 0,
  }
}

describe('unhandled libpq result statuses', () => {
  it('emits a Result for COPY_OUT so the query callback is not left with undefined', (done) => {
    const client = stubClient(emptyResultPq('PGRES_COPY_OUT'))
    client._queryCallback = (err, rows, results) => {
      assert.ifError(err)
      assert.deepEqual(rows, [])
      assert(results)
      assert.deepEqual(results.rows, [])
      done()
    }
    client._emitResult(client.pq)
    client._onReadyForQuery()
  })

  it('emits a Result for COPY_IN', (done) => {
    const client = stubClient(emptyResultPq('PGRES_COPY_IN'))
    client._queryCallback = (err, rows, results) => {
      assert.ifError(err)
      assert(results)
      assert.deepEqual(results.rows, [])
      done()
    }
    client._emitResult(client.pq)
    client._onReadyForQuery()
  })

  it('passes unrecognized statuses to the query callback instead of the client error event', (done) => {
    const client = stubClient(emptyResultPq('PGRES_WEIRD', 'server said no'))
    client.on('error', () => {
      done(new Error('should not emit error on the client'))
    })
    client._queryCallback = (err) => {
      assert(err instanceof Error)
      assert.match(err.message, /server said no/)
      done()
    }
    client._emitResult(client.pq)
    client._onReadyForQuery()
  })

  it('falls back to the status name when libpq has no error message', (done) => {
    const client = stubClient(emptyResultPq('PGRES_WEIRD'))
    client._queryCallback = (err) => {
      assert(err instanceof Error)
      assert.match(err.message, /unrecognized command status: PGRES_WEIRD/)
      done()
    }
    client._emitResult(client.pq)
    client._onReadyForQuery()
  })
})
