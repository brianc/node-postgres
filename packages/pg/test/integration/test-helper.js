'use strict'
var helper = require('./../test-helper')

if (helper.args.native) {
  Client = require('./../../lib/native')
  helper.Client = Client
  helper.pg = helper.pg.native
}

// creates a client from cli parameters
helper.client = function (cb) {
  var client = new Client()
  client.connect(cb)
  return client
}

helper.versionGTE = function (client, testVersion, callback) {
  client.query('SHOW server_version_num', assert.calls(function (err, result) {
    if (err) return callback(err)
    var version = parseInt(result.rows[0].server_version_num, 10)
    return callback(null, version >= testVersion)
  }))
}

// export parent helper stuffs
module.exports = helper
