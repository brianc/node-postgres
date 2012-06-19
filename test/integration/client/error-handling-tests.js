var helper = require(__dirname + '/test-helper');
var util = require('util');

var createErorrClient = function() {
  var client = helper.client();
  client.on('error', function(err) {
    assert.ok(false, "client should not throw query error: " + util.inspect(err));
  });
  client.on('drain', client.end.bind(client));
  return client;
};

test('error handling', function(){

  test('within a simple query', function() {

    var client = createErorrClient();

    var query = client.query("select omfg from yodas_dsflsd where pixistix = 'zoiks!!!'");

    assert.emits(query, 'error', function(error) {
      test('error is a psql error', function() {
        assert.equal(error.severity, "ERROR");
      });
    });

  });

  test('within a prepared statement', function() {

    var client = createErorrClient();

    var q = client.query({text: "CREATE TEMP TABLE boom(age integer); INSERT INTO boom (age) VALUES (28);", binary: false});

    test("when query is parsing", function() {

      //this query wont parse since there ain't no table named bang

      var ensureFuture = function(testClient) {
        test("client can issue more queries successfully", function() {
          var goodQuery = testClient.query("select age from boom");
          assert.emits(goodQuery, 'row', function(row) {
            assert.equal(row.age, 28);
          });
        });
      };

      var query = client.query({
        text: "select * from bang where name = $1",
        values: ['0']
      });

      test("query emits the error", function() {
        assert.emits(query, 'error', function(err) {
          ensureFuture(client);
        });
      });

      test("when a query is binding", function() {

        var query = client.query({
          text: 'select * from boom where age = $1',
          values: ['asldkfjasdf']
        });

        test("query emits the error", function() {

          assert.emits(query, 'error', function(err) {
            test('error has right severity', function() {
              assert.equal(err.severity, "ERROR");
            })

            ensureFuture(client);
          });
        });

        //TODO how to test for errors during execution?
      });
    });
  });

  test('non-query error', function() {
    return false;

    var client = new Client({
      user:'asldkfjsadlfkj'
    });
    assert.emits(client, 'error');
    client.connect();
  });

  test('non-query error with callback', function() {
    return false;
    var client = new Client({
      user:'asldkfjsadlfkj'
    });
    client.connect(assert.calls(function(error, client) {
      assert.ok(error);
    }));
  });

});

test('non-error calls supplied callback', function() {
  var client = new Client({
    user: helper.args.user,
    password: helper.args.password,
    host: helper.args.host,
    port: helper.args.port,
    database: helper.args.database
  });

  client.connect(assert.calls(function(err) {
    assert.isNull(err);
    client.end();
  }))
});

test('when connecting to invalid host', function() {
  return false;
  var client = new Client({
    user: 'brian',
    password: '1234',
    host: 'asldkfjasdf!!#1308140.com'
  });
  assert.emits(client, 'error');
  client.connect();
});

test('when connecting to invalid host with callback', function() {
  return false;
  var client = new Client({
    user: 'brian',
    password: '1234',
    host: 'asldkfjasdf!!#1308140.com'
  });
  client.connect(function(error, client) {
    assert.ok(error);
  });
});

test('multiple connection errors (gh#31)', function() {
  return false;
  test('with single client', function() {
    //don't run yet...this test fails...need to think of fix
    var client = new Client({
      user: 'blaksdjf',
      password: 'omfsadfas',
      host: helper.args.host,
      port: helper.args.port,
      database: helper.args.database
    });
    client.connect();
    assert.emits(client, 'error', function(e) {
      client.connect();
      assert.emits(client, 'error');
    });
  });

  test('with callback method', function() {
    var badConString = "tcp://aslkdfj:oi14081@"+helper.args.host+":"+helper.args.port+"/"+helper.args.database;
    return false;
  });

});

