'use strict'
var helper = require(__dirname + '/../test-helper')
var exec = require('child_process').exec

helper.pg.defaults.poolIdleTimeout = 1000

const pool = new helper.pg.Pool()
pool.connect(function (err, client) {
  client.query('SELECT pg_backend_pid()', function (err, result) {
    var pid = result.rows[0].pg_backend_pid
    var psql = 'psql'
    if (helper.args.host) psql = psql + ' -h ' + helper.args.host
    if (helper.args.port) psql = psql + ' -p ' + helper.args.port
    if (helper.args.user) psql = psql + ' -U ' + helper.args.user
    exec(psql + ' -c "select pg_terminate_backend(' + pid + ')" template1', assert.calls(function (error, stdout, stderr) {
      assert.isNull(error)
    }))
  })
})

pool.on('error', function (err, client) {
  // swallow errors
})
