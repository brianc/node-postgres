var helper = require(__dirname +'/test-helper');

test("simple, unnamed prepared statement", function(){
  var client = helper.client();

  var query = client.query({
    text: 'select age from person where name = $1',
    values: ['Brian']
  });

  assert.emits(query, 'row', function(row) {
    assert.equal(row[0], 20);
  });

  assert.emits(query, 'end', function() {
    client.end();
  });
});

test("named prepared statement", function() {

  var client = helper.client();
  client.on('drain', client.end.bind(client));

  var queryName = "user by age and like name";
  var parseCount = 0;

  test("first named prepared statement",function() {
    var query = client.query({
      text: 'select name from person where age <= $1 and name LIKE $2',
      values: [20, 'Bri%'],
      name: queryName
    });

    test("is parsed", function() {
      client.connection.on('parseComplete', function() {
        parseCount++;
      });
    });

    assert.emits(query, 'row', function(row) {
      assert.equal(row[0], 'Brian');
    });

    assert.emits(query, 'end', function() {
      test("query was parsed", function() {
        assert.equal(parseCount, 1);
      });
    });
  });

  test("second named prepared statement with same name & text", function() {
    var cachedQuery = client.query({
      text: 'select name from person where age <= $1 and name LIKE $2',
      name: queryName,
      values: [10, 'A%']
    });

    assert.emits(cachedQuery, 'row', function(row) {
      assert.equal(row[0], 'Aaron');
    });

    assert.emits(cachedQuery, 'end', function() {
      test("query was only parsed one time", function() {
        assert.equal(parseCount, 1, "Should not have reparsed query");
      });
    });
  });

  test("with same name, but the query text not even there batman!", function() {
    var q = client.query({
      name: queryName,
      values: [30, '%n%']
    });

    test("gets first row", function() {
      assert.emits(q, 'row', function(row) {
        assert.equal(row[0], "Aaron");

        test("gets second row", function() {
          assert.emits(q, 'row', function(row) {
            assert.equal(row[0], "Brian");
          });
        });

      });
    });

    assert.emits(q, 'end', function() {
      assert.equal(parseCount, 1);
    });
  });
});

test("prepared statements on different clients", function() {
  var statementName = "differ";
  var statement1 = "select count(*) from person";
  var statement2 = "select count(*) from person where age < $1";

  var client1Finished = false;
  var client2Finished = false;

  var client1 = helper.client();

  var client2 = helper.client();

  test("client 1 execution", function() {

    var query = client1.query({
      name: statementName,
      text: statement1
    });
    test('gets right data back', function() {
      assert.emits(query, 'row', function(row) {
        assert.equal(row[0], 26);
      });
    });

    assert.emits(query, 'end', function() {
      if(client2Finished) {
        client1.end();
        client2.end();
      } else {
        client1Finished = true;
      }
    });

  });

  test('client 2 execution', function() {
    var query = client2.query({
      name: statementName,
      text: statement2,
      values: [11]
    });

    test('gets right data', function() {
      assert.emits(query, 'row', function(row) {
        assert.equal(row[0], 1);
      });
    });

    assert.emits(query, 'end', function() {
      if(client1Finished) {
        client1.end();
        client2.end();
      } else {
        client2Finished = true;
      }
    });
  });

});

