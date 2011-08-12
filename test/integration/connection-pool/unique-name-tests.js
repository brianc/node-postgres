var helper = require(__dirname + '/test-helper');

helper.pg.defaults.poolSize = 1;
helper.pg.defaults.user = helper.args.user;
helper.pg.defaults.password = helper.args.password;
helper.pg.defaults.database = helper.args.database;
helper.pg.defaults.port = helper.args.port;
helper.pg.defaults.host = helper.args.host;
helper.pg.defaults.poolIdleTimeout = 100;
var args = {
  user: helper.args.user,
  password: helper.args.password,
  database: helper.args.database,
  port: helper.args.port,
  host: helper.args.host
}

var moreArgs = {
  database: helper.args.database,
  password: helper.args.password,
  port: helper.args.port,
  user: helper.args.user,
  host: helper.args.host,
  zomg: true
}

var badArgs = {
  user: helper.args.user + 'laksdjfl',
  host: helper.args.host,
  password: helper.args.password + 'asldkfjlas',
  database: helper.args.database,
  port: helper.args.port,
  zomg: true
}

test('connecting with complete config', function() {

  helper.pg.connect(args, assert.calls(function(err, client) {
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
