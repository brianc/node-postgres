require(__dirname + "/test-helper");

var makeClient = function() {
  var connection = new Connection({stream: "no"});
  connection.startup = function() {};
  connection.connect = function() {};
  connection.query = function(text) {
    this.queries.push(text);
  };
  connection.queries = [];
  var client = new Client({connection: connection});
  client.connect();
  client.connection.emit('connect');
  return client;
};

test('executing query', function() {

  test("queing query", function() {

    test('when connection is ready', function() {
      var client = makeClient();
      assert.empty(client.connection.queries);
      client.connection.emit('readyForQuery');
      client.query('yes');
      assert.length(client.connection.queries, 1);
      assert.equal(client.connection.queries, 'yes');
    });

    test('when connection is not ready', function() {
      var client = makeClient();

      test('query is not sent', function() {
        client.query('boom');
        assert.empty(client.connection.queries);
      });

      test('sends query to connection once ready', function() {
        assert.ok(client.connection.emit('readyForQuery'));
        assert.length(client.connection.queries, 1);
        assert.equal(client.connection.queries[0], "boom");
      });

    });
    test("multiple in the queue", function() {
      var client = makeClient();
      var connection = client.connection;
      var queries = connection.queries;
      client.query('one');
      client.query('two');
      client.query('three');
      assert.empty(queries);

      test("after one ready for query",function() {
        connection.emit('readyForQuery');
        assert.length(queries, 1);
        assert.equal(queries[0], "one");
      });

      test('after two ready for query', function() {
        connection.emit('readyForQuery');
        assert.length(queries, 2);
      });

      test("after a bunch more", function() {
        connection.emit('readyForQuery');
        connection.emit('readyForQuery');
        connection.emit('readyForQuery');
        assert.length(queries, 3);
        assert.equal(queries[0], "one");
        assert.equal(queries[1], 'two');
        assert.equal(queries[2], 'three');
      });
    });
  })
});

