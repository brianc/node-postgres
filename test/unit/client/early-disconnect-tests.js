'use strict'
var helper = require('./test-helper')
var net = require('net')
var pg = require('../../../lib/index.js')

/* console.log() messages show up in `make test` output. TODO: fix it. */
var server = net.createServer(function (c) {
  c.destroy()
  server.close()
})

server.listen(7777, function () {
  var client = new pg.Client('postgres://localhost:7777')
  client.connect(assert.calls(function (err) {
    assert(err)
  }))
})
