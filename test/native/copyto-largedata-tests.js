var helper = require(__dirname+"/../test-helper");
var Client = require(__dirname + "/../../lib/native");
test("COPY TO large amount of data from postgres", function () {
  //there were a bug in native implementation of COPY TO: 
  //if there were too much data (if we face situation
  //when data is not ready while calling PQgetCopyData);
  //while loop in Connection::HandleIOEvent becomes infinite
  //in such way hanging node, consumes 100% cpu, and making connection unusable
  var con = new Client(helper.config),
    rowCount = 100000,
    stdoutStream = con.copyTo('COPY (select generate_series(1, ' + rowCount + ')) TO STDOUT');
  stdoutStream.on('data', function () {
    rowCount--;
  });
  stdoutStream.on('end', function () {
    assert.equal(rowCount, 0, "copy to should load exactly requested number of rows");
    con.query("SELECT 1", assert.calls(function (error, result) {
      assert.ok(!error && result, "loading large amount of data by copy to should not break connection");
      con.end();
    }));
  });
  con.connect();
});
