require(__dirname+'/test-helper');

var pguser = process.env['PGUSER'] || process.env.USER;
var pgdatabase = process.env['PGDATABASE'] || process.env.USER;
var pgport = process.env['PGPORT'] || 5432;

test('client settings', function() {

  test('defaults', function() {
    var client = new Client();
    assert.equal(client.user, pguser);
    assert.equal(client.database, pgdatabase);
    assert.equal(client.port, pgport);
  });

  test('custom', function() {
    var user = 'brian';
    var database = 'pgjstest';
    var password = 'boom';
    var client = new Client({
      user: user,
      database: database,
      port: 321,
      password: password
    });

    assert.equal(client.user, user);
    assert.equal(client.database, database);
    assert.equal(client.port, 321);
    assert.equal(client.password, password);
  });

});

test('initializing from a config string', function() {

  test('uses the correct values from the config string', function() {
    var client = new Client("postgres://brian:pass@host1:333/databasename")
    assert.equal(client.user, 'brian')
    assert.equal(client.password, "pass")
    assert.equal(client.host, "host1")
    assert.equal(client.port, 333)
    assert.equal(client.database, "databasename")
  })

  test('uses the correct values from the config string with space in password', function() {
    var client = new Client("postgres://brian:pass word@host1:333/databasename")
    assert.equal(client.user, 'brian')
    assert.equal(client.password, "pass word")
    assert.equal(client.host, "host1")
    assert.equal(client.port, 333)
    assert.equal(client.database, "databasename")
  })

  test('when not including all values the defaults are used', function() {
    var client = new Client("postgres://host1")
    assert.equal(client.user, process.env['PGUSER'] || process.env.USER)
    assert.equal(client.password, process.env['PGPASSWORD'] || null)
    assert.equal(client.host, "host1")
    assert.equal(client.port, process.env['PGPORT'] || 5432)
    assert.equal(client.database, process.env['PGDATABASE'] || process.env.USER)
  })


})

test('calls connect correctly on connection', function() {
  var client = new Client("/tmp");
  var usedPort = "";
  var usedHost = "";
  client.connection.connect = function(port, host) {
    usedPort = port;
    usedHost = host;
  };
  client.connect();
  assert.equal(usedPort, "/tmp/.s.PGSQL." + pgport);
  assert.strictEqual(usedHost, undefined)
})

