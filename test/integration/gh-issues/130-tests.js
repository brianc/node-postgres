var helper = require(__dirname + '/../test-helper');
var exec = require('child_process').exec;

helper.pg.defaults.poolIdleTimeout = 1000;

helper.pg.connect(helper.config, function(err,client) {
  client.query("SELECT pg_backend_pid()", function(err, result) {
    var pid = result.rows[0].pg_backend_pid;
    exec('psql -c "select pg_terminate_backend('+pid+')" template1', assert.calls(function (error, stdout, stderr) {
        assert.isNull(error);
    }));
  });
});

helper.pg.on('error', function(err, client) {
  //swallow errors
});
