'use strict'
const helper = require('./test-helper')
const Connection = require('../../../lib/connection')
const net = require('net')
const assert = require('assert')

const suite = new helper.Suite()
const { MemoryStream } = helper

suite.test('connection emits stream errors', function (done) {
  const con = new Connection({ stream: new MemoryStream() })
  assert.emits(con, 'error', function (err) {
    assert.equal(err.message, 'OMG!')
    done()
  })
  con.connect()
  con.stream.emit('error', new Error('OMG!'))
})

suite.test('connection emits ECONNRESET errors during normal operation', function (done) {
  const con = new Connection({ stream: new MemoryStream() })
  con.connect()
  assert.emits(con, 'error', function (err) {
    assert.equal(err.code, 'ECONNRESET')
    done()
  })
  const e = new Error('Connection Reset')
  e.code = 'ECONNRESET'
  con.stream.emit('error', e)
})

suite.test('connection does not emit ECONNRESET errors during disconnect', function (done) {
  const con = new Connection({ stream: new MemoryStream() })
  con.connect()
  const e = new Error('Connection Reset')
  e.code = 'ECONNRESET'
  con.end()
  con.stream.emit('error', e)
  done()
})

const SSLNegotiationPacketTests = [
  {
    testName: 'connection does not emit ECONNRESET errors during disconnect also when using SSL',
    errorMessage: null,
    response: 'S',
    responseType: 'sslconnect',
  },
  {
    testName: 'connection emits an error when SSL is not supported',
    errorMessage: 'The server does not support SSL connections',
    response: 'N',
    responseType: 'error',
  },
  {
    testName: 'connection emits an error when postmaster responds to SSL negotiation packet',
    errorMessage: 'There was an error establishing an SSL connection',
    response: 'E',
    responseType: 'error',
  },
]

for (const tc of SSLNegotiationPacketTests) {
  suite.test(tc.testName, function (done) {
    // our fake postgres server
    let socket
    const server = net.createServer(function (c) {
      socket = c
      c.once('data', function (data) {
        c.write(Buffer.from(tc.response))
      })
    })

    server.listen(7778, function () {
      const con = new Connection({ ssl: true })
      con.connect(7778, 'localhost')
      assert.emits(con, tc.responseType, function (err) {
        if (tc.errorMessage !== null || err) {
          assert.equal(err.message, tc.errorMessage)
        }
        con.end()
        socket.destroy()
        server.close()
        done()
      })
      con.requestSsl()
    })
  })
}
