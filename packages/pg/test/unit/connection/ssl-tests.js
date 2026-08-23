'use strict'
const helper = require('./test-helper')
const Connection = require('../../../lib/connection')
const net = require('net')
const tls = require('tls')
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const suite = new helper.Suite()
const { MemoryStream } = helper

// tls.connect verifies the server identity against `servername`, falling back
// to `host` and then to 'localhost'. Since `servername` must not be set to an
// IP address, `host` has to be passed as well or certificates would be
// validated against 'localhost' when connecting to an IP address.
// See https://github.com/brianc/node-postgres/issues/2263

suite.test('SSL upgrade passes the host to the secure stream when connecting to an IP address', function (done) {
  const streamModule = require('../../../lib/stream')
  const originalGetSecureStream = streamModule.getSecureStream

  let capturedOptions = null
  streamModule.getSecureStream = function (options) {
    capturedOptions = options
    return options.socket
  }

  try {
    const con = new Connection({ stream: new MemoryStream(), ssl: true })
    con.connect(1234, '127.0.0.1')
    // server signals SSL support with an 'S' byte
    con.stream.emit('data', Buffer.from('S'))

    assert(capturedOptions, 'getSecureStream should have been called')
    assert.equal(capturedOptions.host, '127.0.0.1', 'the host must be passed for certificate validation')
    assert.equal(capturedOptions.servername, undefined, 'SNI must not be set to an IP address')
    done()
  } finally {
    streamModule.getSecureStream = originalGetSecureStream
  }
})

suite.test(
  'SSL upgrade passes the host and servername to the secure stream when connecting to a hostname',
  function (done) {
    const streamModule = require('../../../lib/stream')
    const originalGetSecureStream = streamModule.getSecureStream

    let capturedOptions = null
    streamModule.getSecureStream = function (options) {
      capturedOptions = options
      return options.socket
    }

    try {
      const con = new Connection({ stream: new MemoryStream(), ssl: true })
      con.connect(1234, 'example.com')
      con.stream.emit('data', Buffer.from('S'))

      assert(capturedOptions, 'getSecureStream should have been called')
      assert.equal(capturedOptions.host, 'example.com')
      assert.equal(capturedOptions.servername, 'example.com')
      done()
    } finally {
      streamModule.getSecureStream = originalGetSecureStream
    }
  }
)

suite.test('TLS verifies the server certificate against the IP address being connected to', function (done) {
  const tlsDir = path.join(__dirname, '..', '..', 'tls')
  const serverKey = fs.readFileSync(path.join(tlsDir, 'test-server.key'))
  const serverCert = fs.readFileSync(path.join(tlsDir, 'test-server.crt'))
  const serverCa = fs.readFileSync(path.join(tlsDir, 'test-server-ca.crt'))

  // our fake postgres server: reply 'S' to the SSLRequest packet, then
  // perform the server side of the TLS handshake on the raw socket
  let socket
  const server = net.createServer(function (c) {
    socket = c
    c.once('data', function () {
      c.write(Buffer.from('S'))
      socket = new tls.TLSSocket(c, { isServer: true, key: serverKey, cert: serverCert })
    })
  })

  server.listen(0, '127.0.0.1', function () {
    // capture which host tls.connect checks the server identity against;
    // without the fix from https://github.com/brianc/node-postgres/pull/2273
    // this was 'localhost' instead of the IP address being connected to
    let verifiedHost = null
    const con = new Connection({
      ssl: {
        ca: serverCa,
        checkServerIdentity: function (host) {
          verifiedHost = host
          return undefined
        },
      },
    })
    con.connect(server.address().port, '127.0.0.1')
    assert.emits(con, 'sslconnect', function () {
      // 'sslconnect' fires before the TLS handshake completes, so wait for it
      con.stream.on('secureConnect', function () {
        assert.equal(verifiedHost, '127.0.0.1', 'the server identity must be verified against the IP address')
        con.end()
        socket.destroy()
        server.close()
        done()
      })
    })
    con.requestSsl()
  })
})
