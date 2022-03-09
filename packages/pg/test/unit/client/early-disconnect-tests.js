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
