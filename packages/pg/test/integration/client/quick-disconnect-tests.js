'use strict'
// test for issue #320
//
const helper = require('./test-helper')

const client = new helper.pg.Client(helper.config)
client.connect()
client.end()
