'use strict'
var buffers = require('../../test-buffers')
var helper = require('./test-helper')
var suite = new helper.Suite()

var net = require('net')

var Server = function (response) {
  this.server = undefined
  this.socket = undefined
  this.response = response
}

Server.prototype.start = function (cb) {
  // this is our fake postgres server
  // it responds with our specified response immediatley after receiving every buffer
  // this is sufficient into convincing the client its connectet to a valid backend
  // if we respond with a readyForQuery message
  this.server = net.createServer(function (socket) {
    this.socket = socket
    if (this.response) {
      this.socket.on('data', function (data) {
        // deny request for SSL
        if (data.length == 8) {
          this.socket.write(Buffer.from('N', 'utf8'))
        // consider all authentication requests as good
        } else if (!data[0]) {
          this.socket.write(buffers.authenticationOk())
        // respond with our canned response
        } else {
          this.socket.write(this.response)
        }
      }.bind(this))
    }
  }.bind(this))

  var port = 54321

  var options = {
    host: 'localhost',
    port: port
  }
  this.server.listen(options.port, options.host, function () {
    cb(options)
  })
}

Server.prototype.drop = function () {
  this.socket.destroy()
}

Server.prototype.close = function (cb) {
  this.server.close(cb)
}

var testServer = function (server, cb) {
  // wait for our server to start
  server.start(function (options) {
    // connect a client to it
    var client = new helper.Client(options)
    client.connect()
      .catch((err) => {
        assert(err instanceof Error)
        clearTimeout(timeoutId)
        server.close(cb)
      })

    // after 50 milliseconds, drop the client
    setTimeout(function () {
      server.drop()
    }, 50)

    // blow up if we don't receive an error
    var timeoutId = setTimeout(function () {
      throw new Error('Client should have emitted an error but it did not.')
    }, 5000)
  })
}

suite.test('readyForQuery server', (done) => {
  const respondingServer = new Server(buffers.readyForQuery())
  testServer(respondingServer, done)
})

suite.test('silent server', (done) => {
  const silentServer = new Server()
  testServer(silentServer, done)
})
