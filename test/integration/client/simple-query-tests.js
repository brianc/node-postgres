var helper = require(__dirname+"/test-helper");
//before running this test make sure you run the script create-test-tables
test("selects rows", function() {
  var client = helper.client();

  var query = client.query("select * from person");
  var rowCount = 0;
  query.on('row', function(row) {
    rowCount++;
  });
  assert.raises(query, 'end', function() {
    assert.equal(rowCount, 26);
    client.end();
  });

});
