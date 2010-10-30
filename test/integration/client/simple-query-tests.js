var helper = require(__dirname+"/test-helper");
//before running this test make sure you run the script create-test-tables
test("simple query interface", function() {

  var client = helper.client();

  var query = client.query("select name from person");

  client.on('drain', client.end.bind(client));

  var rows = [];
  query.on('row', function(row) {
    rows.push(row.fields[0])
  });

  assert.raises(query, 'end', function() {
    test("returned right number of rows", function() {
      assert.length(rows, 26);
    });
    test("row ordering", function(){
      assert.equal(rows[0], "Aaron");
      assert.equal(rows[25], "Zanzabar");
    });
  });
});

test("multiple simple queries", function() {
  var client = helper.client();
  client.query("create temp table bang(id serial, name varchar(5));insert into bang(name) VALUES('boom');")
  client.query("insert into bang(name) VALUES ('yes');");
  var query = client.query("select name from bang");
  assert.raises(query, 'row', function(row) {
    assert.equal(row.fields[0], 'boom');
    assert.raises(query, 'row', function(row) {
      assert.equal(row.fields[0],'yes');
    });
  });
  client.on('drain', client.end.bind(client));
});

