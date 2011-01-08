require(__dirname+'/test-helper');

test('client settings', function() {

  test('defaults', function() {
    var client = new Client();
    assert.equal(client.user, '');
    assert.equal(client.database, '');
    assert.equal(client.port, 5432);
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
    var client = new Client("pg://brian:pass@host1:333/databasename")
    assert.equal(client.user, 'brian')
    assert.equal(client.password, "pass")
    assert.equal(client.host, "host1")
    assert.equal(client.port, 333)
    assert.equal(client.database, "databasename")
  })

  test('when not including all values the defaults are used', function() {
    var client = new Client("pg://host1")
    assert.equal(client.user, "")
    assert.equal(client.password, "")
    assert.equal(client.host, "host1")
    assert.equal(client.port, 5432)
    assert.equal(client.database, "")
  })


})
