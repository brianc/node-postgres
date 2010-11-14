var helper = require(__dirname + '/test-helper');

var createErorrClient = function() {
  var client = helper.client();
  client.on('error', function(err) {
    assert.ok(false, "client should not throw query error: " + sys.inspect(err));
  })
  client.on('drain', client.end.bind(client));
  return client;
};

test('error handling', function(){

  test('within a simple query', function() {

    var client = createErorrClient();

    var query = client.query("select omfg from yodas_soda where pixistix = 'zoiks!!!'");

    assert.emits(query, 'error', function(error) {
      assert.equal(error.severity, "ERROR");
    });

  });

  test('within a prepared statement', function() {

    var client = createErorrClient();

    var q = client.query("CREATE TEMP TABLE boom(age integer); INSERT INTO boom (age) VALUES (28);");

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
      })

      test("when a query is binding", function() {
        var query = client.query({
          text: 'select * from boom where age = $1',
          values: ['asldkfjasdf']
        });

        test("query emits the error", function() {
          assert.emits(query, 'error', function(err) {
            assert.equal(err.severity, "ERROR");
            ensureFuture(client);
          });
        });

        //TODO how to test for errors during execution?
      });
    })
  });

  test('non-query error', function() {

    var client = new Client({
      user:'asldkfjsadlfkj'
    });
    assert.emits(client, 'error');
    client.connect();
  });

});
