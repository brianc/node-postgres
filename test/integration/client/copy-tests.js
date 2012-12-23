var helper = require(__dirname + '/../test-helper');
var pg = require(__dirname + '/../../../lib');
if(helper.args.native) {
  pg = require(__dirname + '/../../../lib').native;
}
var ROWS_TO_INSERT  = 1000;
var prepareTable = function (client, callback) {
  client.query(
    'CREATE TEMP TABLE copy_test (id SERIAL, name CHARACTER VARYING(10), age INT)',
    assert.calls(function (err, result) {
      assert.equal(err, null, "create table query should not fail");
      callback();
    })
  );
};
test('COPY FROM', function () {
  pg.connect(helper.config, function (error, client) {
    assert.equal(error, null, "Failed to connect: " + helper.sys.inspect(error));
    prepareTable(client, function () {
      var stream = client.copyFrom("COPY  copy_test (name, age)  FROM stdin WITH CSV");
      stream.on('error', function (error) {
        assert.ok(false, "COPY FROM stream should not emit errors" + helper.sys.inspect(error)); 
      });
      for (var i = 0; i < ROWS_TO_INSERT; i++) {
        stream.write( String(Date.now() + Math.random()).slice(0,10) + ',' + i + '\n');
      }
      assert.emits(stream, 'close', function () {
        client.query("SELECT count(*), sum(age) from copy_test", function (err, result) {
          assert.equal(err, null, "Query should not fail");
          assert.lengthIs(result.rows, 1)
          assert.equal(result.rows[0].sum, ROWS_TO_INSERT * (0 + ROWS_TO_INSERT -1)/2);
          assert.equal(result.rows[0].count, ROWS_TO_INSERT);
          pg.end(helper.config);     
        });
      }, "COPY FROM stream should emit close after query end");
      stream.end();
    });
  });
});
test('COPY TO', function () {
  pg.connect(helper.config, function (error, client) {
    assert.equal(error, null, "Failed to connect: " + helper.sys.inspect(error));
    prepareTable(client, function () {
      var stream = client.copyTo("COPY  person (id, name, age)  TO stdin WITH CSV");
      var  buf = new Buffer(0);
      stream.on('error', function (error) {
        assert.ok(false, "COPY TO stream should not emit errors" + helper.sys.inspect(error)); 
      });
      assert.emits(stream, 'data', function (chunk) {
        buf = Buffer.concat([buf, chunk]);  
      }, "COPY IN stream should emit data event for each row"); 
      assert.emits(stream, 'end', function () {
        var lines = buf.toString().split('\n');
        assert.equal(lines.length >= 0, true, "copy in should return rows saved by copy from");
        assert.equal(lines[0].split(',').length, 3, "each line should consists of 3 fields");
        pg.end(helper.config);     
      }, "COPY IN stream should emit end event after all rows");
    });
  });
});

