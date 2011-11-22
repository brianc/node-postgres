var helper = require(__dirname+"/test-helper");
//before running this test make sure you run the script create-test-tables
test("simple query interface", function() {

  var client = helper.client();

  var query = client.query("select name from person order by name");

  client.on('drain', client.end.bind(client));

  var rows = [];
  query.on('row', function(row) {
    rows.push(row['name'])
  });
  query.once('row', function(row) {
    test('Can iterate through columns', function () {
      var columnCount = 0;
      for (column in row) {
        columnCount++;
      };
      if ('length' in row) {
        assert.lengthIs(row, columnCount, 'Iterating through the columns gives a different length from calling .length.');
      }
    });
  });

  assert.emits(query, 'end', function() {
    test("returned right number of rows", function() {
      assert.lengthIs(rows, 26);
    });
    test("row ordering", function(){
      assert.equal(rows[0], "Aaron");
      assert.equal(rows[25], "Zanzabar");
    });
  });
});

test("multiple simple queries", function() {
  var client = helper.client();
  client.query({ text: "create temp table bang(id serial, name varchar(5));insert into bang(name) VALUES('boom');", binary: false })
  client.query("insert into bang(name) VALUES ('yes');");
  var query = client.query("select name from bang");
  assert.emits(query, 'row', function(row) {
    assert.equal(row['name'], 'boom');
    assert.emits(query, 'row', function(row) {
      assert.equal(row['name'],'yes');
    });
  });
  client.on('drain', client.end.bind(client));
});

test("multiple select statements", function() {
  var client = helper.client();
  client.query({text: "create temp table boom(age integer); insert into boom(age) values(1); insert into boom(age) values(2); insert into boom(age) values(3)", binary: false});
  client.query({text: "create temp table bang(name varchar(5)); insert into bang(name) values('zoom');", binary: false});
  var result = client.query({text: "select age from boom where age < 2; select name from bang", binary: false});
  assert.emits(result, 'row', function(row) {
    assert.strictEqual(row['age'], 1);
    assert.emits(result, 'row', function(row) {
      assert.strictEqual(row['name'], 'zoom');
    });
  });
  client.on('drain', client.end.bind(client));
});
