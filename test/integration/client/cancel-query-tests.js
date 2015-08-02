var helper = require(__dirname+"/test-helper");

test("cancellation of an active query", function() {
  var client = helper.client();

  var qry = "select pg_sleep(4)";
  var query1 = client.query(qry);
  client.cancel(client, query1);
  var otherClient = helper.client();
  activeQueries = "SELECT * FROM pg_stat_activity WHERE query LIKE '%pg_sleep(4)%' AND query NOT LIKE '%pg_stat_activity%'";
  otherClient.query(activeQueries, assert.calls(function(err, result) {
    assert.equal(result.rows.length, 0);
    otherClient.end();
    client.end();
  }));
});

//before running this test make sure you run the script create-test-tables
test("cancellation of a query", function() {

  var client = helper.client();

  var qry = "select name from person order by name";

  client.on('drain', client.end.bind(client));

  var rows3 = 0;

  var query1 = client.query(qry);
  query1.on('row', function(row) {
    throw new Error('Should not emit a row');
  });
  var query2 = client.query(qry);
  query2.on('row', function(row) {
    throw new Error('Should not emit a row');
  });
  var query3 = client.query(qry);
  query3.on('row', function(row) {
    rows3++;
  });
  var query4 = client.query(qry);
  query4.on('row', function(row) {
    throw new Error('Should not emit a row');
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
