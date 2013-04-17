var helper = require(__dirname + "/../test-helper");
var pg = require(__dirname + "/../../../lib");
pg = pg;

//first make pool hold 2 clients
pg.defaults.poolSize = 2;


//get first client
pg.connect(helper.config, assert.success(function(client, done) {
  client.id = 1;
    pg.connect(helper.config, assert.success(function(client2, done2) {
      client2.id = 2;
      var pidColName = 'procpid'
      helper.versionGTE(client2, '9.2.0', assert.success(function(isGreater) {
        if(isGreater) {
          pidColName = 'pid';
        }
        var killIdleQuery = 'SELECT ' + pidColName + ', (SELECT pg_terminate_backend(' + pidColName + ')) AS killed FROM pg_stat_activity WHERE state = $1';
        done2();
        //subscribe to the pg error event
        assert.emits(pg, 'error', function(error, brokenClient) {
          assert.ok(error);
          assert.ok(brokenClient);
          assert.equal(client.id, brokenClient.id);
        });
        //kill the connection from client
        client2.query(killIdleQuery, ['idle'], assert.success(function(res) {
          //check to make sure client connection actually was killed
          assert.lengthIs(res.rows, 1);
          pg.end();
        }));
      }));
    }));
}));
