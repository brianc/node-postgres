var helper = require(__dirname + "/../test-helper");
var pg = require(__dirname + "/../../../lib");
helper.pg = pg;

//first make pool hold 2 clients
helper.pg.defaults.poolSize = 2;

var killIdleQuery = 'SELECT procpid, (SELECT pg_terminate_backend(procpid)) AS killed FROM pg_stat_activity WHERE current_query LIKE \'<IDLE>\'';

//get first client
helper.pg.connect(helper.config, assert.success(function(client) {
  client.id = 1;
  helper.pg.connect(helper.config, assert.success(function(client2) {
    client2.id = 2;
    //subscribe to the pg error event
    assert.emits(helper.pg, 'error', function(error, brokenClient) {
      assert.ok(error);
      assert.ok(brokenClient);
      assert.equal(client.id, brokenClient.id);
      helper.pg.end();
    });
    //kill the connection from client
    client2.query(killIdleQuery, assert.success(function(res) {
      //check to make sure client connection actually was killed
      assert.lengthIs(res.rows, 1);
    }));
  }));
}));
