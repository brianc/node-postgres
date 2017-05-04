var helper = require(__dirname + "/../test-helper");
var pg = require(__dirname + "/../../../lib");

pg.connect(helper.config, assert.success(function(client, done) {
    assert.equal(Object.keys(pg._pools).length, 1);
    pg.connect(helper.config, assert.success(function(client2, done2) {
      assert.equal(Object.keys(pg._pools).length, 1);

      done();
      done2();
      pg.end();
    }));
}));
