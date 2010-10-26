var helper = require(__dirname+"/test-helper");
//before running this test make sure you run the script create-test-tables
test("simple query interface", function() {

  var client = helper.client();

  var query = client.query("select name from person");

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
    client.end();
  });

});

