'use strict'
var helper = require('./test-helper')
var pg = require('../../../lib/index.js')
const { WebSocketServer } = require('ws')

var wss = new WebSocketServer({port: 7777, allowHalfOpen: false})

wss.on('connection', (c) => {
    c.terminate()
    wss.close()
})

wss.on('listening', function () {
    var client = new pg.Client({host: 'localhost', port: 7777})
    client.connect(
        assert.calls(function (err) {
            assert(err)
        })
    )
})

// 'use strict'
// var helper = require('./test-helper')
// var net = require('net')
// var pg = require('../../../lib/index.js')

// /* console.log() messages show up in `make test` output. TODO: fix it. */
// var server = net.createServer(function (c) {
//   c.destroy()
//   server.close()
// })

// server.listen(7777, function () {
//   var client = new pg.Client('postgres://localhost:7777')
//   client.connect(
//     assert.calls(function (err) {
//       console.log("ERROR IS "+err)
//       assert(err)
//     })
//   )
// })

