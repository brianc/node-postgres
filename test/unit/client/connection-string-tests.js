require(__dirname + '/test-helper');

test("using connection string in client constructor", function() {
  var client = new Client("postgres://brian:pw@boom:381/lala");
  test("parses user", function() {
    assert.equal(client.user,'brian');
  })
  test("parses password", function() {
    assert.equal(client.password, 'pw');
  })
  test("parses host", function() {
    assert.equal(client.host, 'boom');
  })
  test('parses port', function() {
    assert.equal(client.port, 381)
  })
  test('parses database', function() {
    assert.equal(client.database, 'lala')
  })
})

