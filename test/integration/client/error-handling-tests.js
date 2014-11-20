var helper = require(__dirname + '/test-helper');
var util = require('util');

var createErorrClient = function() {
  var client = helper.client();
  client.once('error', function(err) {
    //console.log('error', util.inspect(err));
    assert.fail('Client shoud not throw error during query execution');
  });
  client.on('drain', client.end.bind(client));
  return client;
};

test('error handling', function(){
  test('within a simple query', function() {

    var client = createErorrClient();

    var query = client.query("select omfg from yodas_dsflsd where pixistix = 'zoiks!!!'");

    assert.emits(query, 'error', function(error) {
      assert.equal(error.severity, "ERROR");
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

    var client = new Client({
      user:'asldkfjsadlfkj'
    });
    assert.emits(client, 'error');
    client.connect();
  });

  test('non-query error with callback', function() {
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
    assert.ifError(err);
    client.end();
  }))
});

test('when connecting to invalid host', function() {
  //this test fails about 30% on travis and only on travis...
  //I'm not sure what the cause could be
  if(process.env.TRAVIS) return false;

  var client = new Client({
    user: 'aslkdjfsdf',
    password: '1234',
    host: 'asldkfjasdf!!#1308140.com'
  });

  var delay = 5000;
  var tid = setTimeout(function() {
    var msg = "When connecting to an invalid host the error event should be emitted but it has been " + delay + " and still no error event."
    assert(false, msg);
  }, delay);
  client.on('error', function() {
    clearTimeout(tid);
  })
  client.connect();
});

test('when connecting to invalid host with callback', function() {
  var client = new Client({
    user: 'brian',
    password: '1234',
    host: 'asldkfjasdf!!#1308140.com'
  });
  client.connect(function(error, client) {
    assert(error);
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
    var badConString = "postgres://aslkdfj:oi14081@"+helper.args.host+":"+helper.args.port+"/"+helper.args.database;
    return false;
  });
});

test('query receives error on client shutdown', function() {
  var client = new Client(helper.config);
  client.connect(assert.calls(function() {
    client.query('SELECT pg_sleep(5)', assert.calls(function(err, res) {
      assert(err);
    }));
    client.end();
    assert.emits(client, 'end');
  }));
});

