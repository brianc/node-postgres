var helper = require("./test-helper");
var Query = helper.pg.Query;

//before running this test make sure you run the script create-test-tables
new helper.Suite().test("cancellation of a query", function() {

  var client = helper.client();

  var qry = "select name from person order by name";

  client.on('drain', client.end.bind(client));

  var rows3 = 0;

  var query1 = client.query(new Query(qry));
  query1.on('row', function(row) {
    throw new Error('Should not emit a row')
  });
  var query2 = client.query(new Query(qry));
  query2.on('row', function(row) {
    throw new Error('Should not emit a row')
  });
  var query3 = client.query(new Query(qry));
  query3.on('row', function(row) {
    rows3++;
  });
  var query4 = client.query(new Query(qry));
  query4.on('row', function(row) {
    throw new Error('Should not emit a row')
  });

  helper.pg.cancel(helper.config, client, query1);
  helper.pg.cancel(helper.config, client, query2);
  helper.pg.cancel(helper.config, client, query4);

  assert.emits(query3, 'end', function() {
    test("returned right number of rows", function() {
      assert.equal(rows3, 26);
    });
  });
});
