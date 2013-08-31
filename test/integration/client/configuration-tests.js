var helper = require(__dirname + '/test-helper');
var pg = helper.pg;

//clear process.env
var realEnv = {};
for(var key in process.env) {
  realEnv[key] = process.env[key];
  if(!key.indexOf('PG')) delete process.env[key];
}

test('default values', function() {
  assert.same(pg.defaults,{
    user: process.env.USER,
    database: process.env.USER,
    password: null,
    port: 5432,
    rows: 0,
    poolSize: 10
  })
  test('are used in new clients', function() {
    var client = new pg.Client();
    assert.same(client,{
      user: process.env.USER,
      database: process.env.USER,
      password: null,
      port: 5432
    })
  })
})

if(!helper.args.native) {
  test('modified values', function() {
    pg.defaults.user = 'boom'
    pg.defaults.password = 'zap'
    pg.defaults.database = 'pow'
    pg.defaults.port = 1234
    pg.defaults.host = 'blam'
    pg.defaults.rows = 10
    pg.defaults.poolSize = 0

    test('are passed into created clients', function() {
      var client = new Client();
      assert.same(client,{
        user: 'boom',
        password: 'zap',
        database: 'pow',
        port: 1234,
        host: 'blam'
      })
    })
  })
}


//restore process.env
for(var key in realEnv) {
  process.env[key] = realEnv[key];
}
