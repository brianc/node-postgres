var helper = require(__dirname+"/test-helper");

//before running this test make sure you run the script create-test-tables
test("cancellation of a query", function() {

  var client = helper.client();

  var qry = client.query("select name from person order by name");

  client.on('drain', client.end.bind(client));

	var rows1 = 0, rows2 = 0, rows3 = 0, rows4 = 0;

	var query1 = client.query(qry);
	query1.on('row', function(row) {
		rows1++;
	});
	var query2 = client.query(qry);
	query2.on('row', function(row) {
		rows2++;
	});
	var query3 = client.query(qry);
	query3.on('row', function(row) {
		rows3++;
	});
	var query4 = client.query(qry);
	query4.on('row', function(row) {
		rows4++;
	});

	helper.pg.cancel(helper.config, client, query1);
	helper.pg.cancel(helper.config, client, query2);
	helper.pg.cancel(helper.config, client, query4);

	setTimeout(function() {
		assert.equal(rows1, 0);
		assert.equal(rows2, 0);
		assert.equal(rows4, 0);
	}, 2000);

  assert.emits(query3, 'end', function() {
		test("returned right number of rows", function() {
			assert.equal(rows3, 26);
		});
	});
});
