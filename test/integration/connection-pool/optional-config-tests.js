var helper = require(__dirname + '/test-helper');

//setup defaults
helper.pg.defaults.user = helper.args.user;
helper.pg.defaults.password = helper.args.password;
helper.pg.defaults.host = helper.args.host;
helper.pg.defaults.port = helper.args.port;
helper.pg.defaults.database = helper.args.database;
helper.pg.defaults.poolSize = 1;

helper.pg.connect(assert.calls(function(err, client) {
  assert.isNull(err);
  client.end();
}));
