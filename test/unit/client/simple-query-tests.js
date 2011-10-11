var helper = require(__dirname + "/test-helper");

test('executing query', function() {

  test("queing query", function() {

    test('when connection is ready', function() {
      var client = helper.client();
      assert.empty(client.connection.queries);
      client.connection.emit('readyForQuery');
      client.query('yes');
      assert.lengthIs(client.connection.queries, 1);
      assert.equal(client.connection.queries, 'yes');
    });

    test('when connection is not ready', function() {
      var client = helper.client();

      test('query is not sent', function() {
        client.query('boom');
        assert.empty(client.connection.queries);
      });

      test('sends query to connection once ready', function() {
        assert.ok(client.connection.emit('readyForQuery'));
        assert.lengthIs(client.connection.queries, 1);
        assert.equal(client.connection.queries[0], "boom");
      });

    });

    test("multiple in the queue", function() {
      var client = helper.client();
      var connection = client.connection;
      var queries = connection.queries;
      client.query('one');
      client.query('two');
      client.query('three');
      assert.empty(queries);

      test("after one ready for query",function() {
        connection.emit('readyForQuery');
        assert.lengthIs(queries, 1);
        assert.equal(queries[0], "one");
      });

      test('after two ready for query', function() {
        connection.emit('readyForQuery');
        assert.lengthIs(queries, 2);
      });

      test("after a bunch more", function() {
        connection.emit('readyForQuery');
        connection.emit('readyForQuery');
        connection.emit('readyForQuery');
        assert.lengthIs(queries, 3);
        assert.equal(queries[0], "one");
        assert.equal(queries[1], 'two');
        assert.equal(queries[2], 'three');
      });
    });
  });

  test("query event binding and flow", function() {
    var client = helper.client();
    var con = client.connection;
    var query = client.query('whatever');

    test("has no queries sent before ready", function() {
      assert.empty(con.queries);
    });

    test('sends query on readyForQuery event', function() {
      con.emit('readyForQuery');
      assert.lengthIs(con.queries, 1);
      assert.equal(con.queries[0], 'whatever');
    });

    test('handles rowDescription message', function() {
      var handled = con.emit('rowDescription',{
        fields: [{
          name: 'boom'
        }]
      });
      assert.ok(handled, "should have handlded rowDescritpion");
    });

    test('handles dataRow messages', function() {
      assert.emits(query, 'row', function(row) {
        assert.equal(row['boom'], "hi");
      });

      var handled = con.emit('dataRow', { fields: ["hi"] });
      assert.ok(handled, "should have handled first data row message");

      assert.emits(query, 'row', function(row) {
        assert.equal(row['boom'], "bye");
      });

      var handledAgain = con.emit('dataRow', { fields: ["bye"] });
      assert.ok(handledAgain, "should have handled seciond data row message");
    });

    //multiple command complete messages will be sent
    //when multiple queries are in a simple command
    test('handles command complete messages', function() {
      con.emit('commandComplete', {
        text: 'INSERT 31 1'
      });
    });

    test('removes itself after another readyForQuery message', function() {
      return false;
      assert.emits(query, "end", function(msg) {
        //TODO do we want to check the complete messages?
      });
      con.emit("readyForQuery");
      //this would never actually happen
      ['dataRow','rowDescritpion', 'commandComplete'].forEach(function(msg) {
        assert.equal(con.emit(msg), false, "Should no longer be picking up '"+ msg +"' messages");
      });
    });

  });

});

