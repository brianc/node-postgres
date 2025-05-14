'use strict'
require('./test-helper')
const net = require('net')
const pg = require('../../../lib/index.js')
const assert = require('assert')

/* console.log() messages show up in `make test` output. TODO: fix it. */
const server = net.createServer(function (c) {
  c.destroy()
  server.close()
})

server.listen(7777, function () {
  const client = new pg.Client('postgres://localhost:7777')
  client.connect(
    assert.calls(function (err) {
      assert(err)
    })
  )
})
