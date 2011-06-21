var helper = require(__dirname + '/test-helper');

helper.pg.defaults.poolSize = 1;

var args = {
  user: helper.args.user,
  password: helper.args.password,
  database: helper.args.database,
  port: helper.args.port,
  host: helper.args.host
}

helper.pg.connect(args, assert.calls(function(err, client) {
  assert.isNull(err);
  client.iGotAccessed = true;
  client.query("SELECT NOW()")
}))

var moreArgs = {
  user: helper.args.user + "2",
  host: helper.args.host,
  password: helper.args.password,
  database: helper.args.database,
  port: helper.args.port,
  zomg: true
}

helper.pg.connect(moreArgs, assert.calls(function(err, client) {
  assert.isNull(err);
  assert.ok(client.iGotAccessed === true)
  client.end();
}))
