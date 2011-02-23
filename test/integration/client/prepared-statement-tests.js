var helper = require(__dirname +'/test-helper');

test("simple, unnamed prepared statement", function(){
  var client = helper.client();

  var query = client.query({
    text: 'select age from person where name = $1',
    values: ['Brian']
  });

  assert.emits(query, 'row', function(row) {
    assert.equal(row.age, 20);
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

    assert.emits(query, 'row', function(row) {
      assert.equal(row.name, 'Brian');
    });

    assert.emits(query, 'end', function() {
    });
  });

  test("second named prepared statement with same name & text", function() {
    var cachedQuery = client.query({
      text: 'select name from person where age <= $1 and name LIKE $2',
      name: queryName,
      values: [10, 'A%']
    });

    assert.emits(cachedQuery, 'row', function(row) {
      assert.equal(row.name, 'Aaron');
    });

    assert.emits(cachedQuery, 'end', function() {
    });
  });

  test("with same name, but the query text not even there batman!", function() {
    var q = client.query({
      name: queryName,
      values: [30, '%n%']
    });

    test("gets first row", function() {
      assert.emits(q, 'row', function(row) {
        assert.equal(row.name, "Aaron");

        test("gets second row", function() {
          assert.emits(q, 'row', function(row) {
            assert.equal(row.name, "Brian");
          });
        });

      });
    });

    assert.emits(q, 'end', function() {

    });
  });
});

test("prepared statements on different clients", function() {
  var statementName = "differ";
  var statement1 = "select count(*) as count from person";
  var statement2 = "select count(*) as count from person where age < $1";

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
        assert.equal(row.count, 26);
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
        assert.equal(row.count, 1);
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

test('prepared statement', function() {
  var client = helper.client();
  client.on('drain', client.end.bind(client));
  client.query('CREATE TEMP TABLE zoom(name varchar(100));');
  client.query("INSERT INTO zoom (name) VALUES ('zed')");
  client.query("INSERT INTO zoom (name) VALUES ('postgres')");
  client.query("INSERT INTO zoom (name) VALUES ('node postgres')");

  var checkForResults = function(q) {
    test('row callback fires for each result', function() {
      assert.emits(q, 'row', function(row) {
        assert.equal(row.name, 'node postgres');

        assert.emits(q, 'row', function(row) {
          assert.equal(row.name, 'postgres');

          assert.emits(q, 'row', function(row) {
            assert.equal(row.name, 'zed');
          })
        });
      })
    })
  };

  test('with small row count', function() {
    var query = client.query({
      name: 'get names',
      text: "SELECT name FROM zoom ORDER BY name",
      rows: 1
    });

    checkForResults(query);

  })

  test('with large row count', function() {
    var query = client.query({
      name: 'get names',
      text: 'SELECT name FROM zoom ORDER BY name',
      rows: 1000
    })
    checkForResults(query);
  })

})
