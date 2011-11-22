var helper = require(__dirname + '/test-helper');

helper.pg.defaults.poolSize = 1;
helper.pg.defaults.user = helper.args.user;
helper.pg.defaults.password = helper.args.password;
helper.pg.defaults.database = helper.args.database;
helper.pg.defaults.port = helper.args.port;
helper.pg.defaults.host = helper.args.host;
helper.pg.defaults.binary = helper.args.binary;
helper.pg.defaults.poolIdleTimeout = 100;

var moreArgs = {};
for (c in helper.config) {
  moreArgs[c] = helper.config[c];
}
moreArgs.zomg = true;

var badArgs = {};
for (c in helper.config) {
  badArgs[c] = helper.config[c];
}

badArgs.user = badArgs.user + 'laksdjfl';
badArgs.password = badArgs.password + 'asldkfjlas';
badArgs.zomg = true;

test('connecting with complete config', function() {

  helper.pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);
    client.iGotAccessed = true;
    client.query("SELECT NOW()")
  }));

});

test('connecting with different config object', function() {

  helper.pg.connect(moreArgs, assert.calls(function(err, client) {
    assert.isNull(err);
    assert.ok(client.iGotAccessed === true)
    client.query("SELECT NOW()");
  }))

});

test('connecting with all defaults', function() {

  helper.pg.connect(assert.calls(function(err, client) {
    assert.isNull(err);
    assert.ok(client.iGotAccessed === true);
    client.end();
  }));

});

test('connecting with invalid config', function() {

  helper.pg.connect(badArgs, assert.calls(function(err, client) {
    assert.ok(err != null, "Expected connection error using invalid connection credentials");
  }));

});
