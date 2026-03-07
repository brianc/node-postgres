'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const dc = require('diagnostics_channel')

const hasTracingChannel = typeof dc.tracingChannel === 'function'

const suite = new helper.Suite()
const test = suite.test.bind(suite)
// pass undefined as callback to skip when TracingChannel is unavailable
const testTracing = (name, cb) => test(name, hasTracingChannel ? cb : undefined)

testTracing('query diagnostics channel', function () {
  testTracing('publishes start and asyncEnd on successful query', function (done) {
    const client = helper.client()
    client.connection.emit('readyForQuery')

    const events = []
    const channel = dc.tracingChannel('pg:query')

    const subs = {
      start: (ctx) => events.push({ type: 'start', context: ctx }),
      end: () => {},
      asyncStart: () => {},
      asyncEnd: (ctx) => {
        events.push({ type: 'asyncEnd', context: ctx })

        // asyncEnd fires after the callback, so check everything here
        assert.equal(events.length, 2)
        assert.equal(events[0].type, 'start')
        assert.equal(events[0].context.query.text, 'SELECT 1')
        assert.equal(events[0].context.client.database, client.database)

        assert.equal(events[1].type, 'asyncEnd')
        assert.equal(events[1].context.result.command, 'SELECT')
        assert.equal(events[1].context.result.rowCount, 1)

        channel.unsubscribe(subs)
        done()
      },
      error: (ctx) => events.push({ type: 'error', context: ctx }),
    }

    channel.subscribe(subs)

    client.query('SELECT 1', (err, res) => {
      assert.ifError(err)
    })

    // simulate query execution
    client.connection.emit('rowDescription', { fields: [{ name: 'col' }] })
    client.connection.emit('dataRow', { fields: ['value'] })
    client.connection.emit('commandComplete', { text: 'SELECT 1' })
    client.connection.emit('readyForQuery')
  })

  testTracing('publishes error on failed query', function (done) {
    const client = helper.client()
    client.connection.emit('readyForQuery')

    const events = []
    const channel = dc.tracingChannel('pg:query')

    const subs = {
      start: (ctx) => events.push({ type: 'start', context: ctx }),
      end: () => {},
      asyncStart: () => {},
      asyncEnd: () => {},
      error: (ctx) => {
        events.push({ type: 'error', context: ctx })

        const startEvent = events.find((e) => e.type === 'start')
        assert.ok(startEvent)
        assert.equal(startEvent.context.query.text, 'BAD QUERY')

        channel.unsubscribe(subs)
        done()
      },
    }

    channel.subscribe(subs)

    client.query('BAD QUERY', (err) => {
      assert.ok(err)
    })

    // simulate error
    client.connection.emit('errorMessage', {
      severity: 'ERROR',
      message: 'syntax error',
    })
  })

  testTracing('query context includes client info', function (done) {
    const client = helper.client({ database: 'testdb', host: 'localhost', port: 5432, user: 'testuser' })
    client.connection.emit('readyForQuery')

    let capturedContext
    const channel = dc.tracingChannel('pg:query')

    const subs = {
      start: (ctx) => {
        capturedContext = ctx
      },
      end: () => {},
      asyncStart: () => {},
      asyncEnd: () => {
        assert.equal(capturedContext.client.host, 'localhost')
        assert.equal(capturedContext.client.user, 'testuser')

        channel.unsubscribe(subs)
        done()
      },
      error: () => {},
    }

    channel.subscribe(subs)

    client.query('SELECT 1', () => {})

    client.connection.emit('rowDescription', { fields: [{ name: 'col' }] })
    client.connection.emit('dataRow', { fields: ['value'] })
    client.connection.emit('commandComplete', { text: 'SELECT 1' })
    client.connection.emit('readyForQuery')
  })

  testTracing('promise query publishes diagnostics', function (done) {
    const client = helper.client()
    client.connection.emit('readyForQuery')

    const events = []
    const channel = dc.tracingChannel('pg:query')

    const subs = {
      start: (ctx) => events.push({ type: 'start', context: ctx }),
      end: () => {},
      asyncStart: () => {},
      asyncEnd: (ctx) => {
        events.push({ type: 'asyncEnd', context: ctx })

        assert.ok(events.find((e) => e.type === 'start'))
        assert.equal(events[0].context.query.text, 'SELECT 1')

        channel.unsubscribe(subs)
        done()
      },
      error: () => {},
    }

    channel.subscribe(subs)

    client.query('SELECT 1').then(() => {})

    client.connection.emit('rowDescription', { fields: [{ name: 'col' }] })
    client.connection.emit('dataRow', { fields: ['value'] })
    client.connection.emit('commandComplete', { text: 'SELECT 1' })
    client.connection.emit('readyForQuery')
  })
})

testTracing('connection diagnostics channel', function () {
  testTracing('publishes start on connect with callback', function (done) {
    const Connection = require('../../../lib/connection')
    const { Client } = helper

    let capturedContext
    const channel = dc.tracingChannel('pg:connection')

    const subs = {
      start: (ctx) => {
        capturedContext = ctx
      },
      end: () => {},
      asyncStart: () => {},
      asyncEnd: () => {
        assert.ok(capturedContext)
        assert.equal(capturedContext.connection.database, 'testdb')
        assert.equal(capturedContext.connection.host, 'myhost')

        channel.unsubscribe(subs)
        done()
      },
      error: () => {},
    }

    channel.subscribe(subs)

    const connection = new Connection({ stream: 'no' })
    connection.startup = function () {}
    connection.connect = function () {}
    const client = new Client({ connection: connection, database: 'testdb', host: 'myhost', port: 5432 })

    client.connect((err) => {
      assert.ifError(err)
    })

    // simulate successful connection
    connection.emit('connect')
    connection.emit('readyForQuery')
  })
})
