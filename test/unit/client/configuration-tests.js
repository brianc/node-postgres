require(__dirname+'/test-helper');

test('client settings', function() {

  test('defaults', function() {
    var client = new Client();
    assert.equal(client.user, null);
    assert.equal(client.database, null);
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
