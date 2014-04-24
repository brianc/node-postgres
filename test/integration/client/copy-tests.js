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
      assert.equal(err, null,
        err && err.message ? "create table query should not fail: " + err.message : null);
      callback();
    })
  );
};
test('COPY FROM', function () {
  pg.connect(helper.config, function (error, client, done) {
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
          done();
        });
      }, "COPY FROM stream should emit close after query end");
      stream.end();
    });
  });
});
test('COPY TO', function () {
  pg.connect(helper.config, function (error, client, done) {
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
        done();
      }, "COPY IN stream should emit end event after all rows");
    });
  });
});

test('COPY TO, queue queries', function () {
  if(helper.config.native) return false;
  pg.connect(helper.config, assert.calls(function (error, client, done) {
    assert.equal(error, null, "Failed to connect: " + helper.sys.inspect(error));
    prepareTable(client, function () {
      var query1Done = false,
        copyQueryDone = false,
        query2Done = false;
      client.query("SELECT count(*) from person", function () {
        query1Done = true;
        assert.ok(!copyQueryDone && ! query2Done, "first query has to be executed before others");
      });
      var stream = client.copyTo("COPY  person (id, name, age)  TO stdin WITH CSV");
      //imitate long query, to make impossible,
      //that copy query end callback runs after
      //second query callback
      client.query("SELECT pg_sleep(1)", function () {
        query2Done = true;
        assert.ok(copyQueryDone && query2Done, "second query has to be executed after others");
      });
      var  buf = new Buffer(0);
      stream.on('error', function (error) {
        assert.ok(false, "COPY TO stream should not emit errors" + helper.sys.inspect(error));
      });
      assert.emits(stream, 'data', function (chunk) {
        buf = Buffer.concat([buf, chunk]);
      }, "COPY IN stream should emit data event for each row");
      assert.emits(stream, 'end', function () {
        copyQueryDone = true;
        assert.ok(query1Done && ! query2Done, "copy query has to be executed before second query and after first");
        var lines = buf.toString().split('\n');
        assert.equal(lines.length >= 0, true, "copy in should return rows saved by copy from");
        assert.equal(lines[0].split(',').length, 3, "each line should consists of 3 fields");
        done();
      }, "COPY IN stream should emit end event after all rows");
    });
  }));
});

test("COPY TO incorrect usage with large data", function () {
  if(helper.config.native) return false;
  //when many data is loaded from database (and it takes a lot of time)
  //there are chance, that query will be canceled before it ends
  //but if there are not so much data, cancel message may be
  //send after copy query ends
  //so we need to test both situations
  pg.connect(helper.config, assert.calls(function (error, client, done) {
    assert.equal(error, null, "Failed to connect: " + helper.sys.inspect(error));
    //intentionally incorrect usage of copy.
    //this has to report error in standart way, instead of just throwing exception
    client.query(
      "COPY (SELECT GENERATE_SERIES(1, 10000000)) TO STDOUT WITH CSV",
      assert.calls(function (error) {
        assert.ok(error, "error should be reported when sending copy to query with query method");
        client.query("SELECT 1", assert.calls(function (error, result) {
          assert.isNull(error, "incorrect copy usage should not break connection");
          assert.ok(result, "incorrect copy usage should not break connection");
          done();
        }));
      })
    );
  }));
});

test("COPY TO incorrect usage with small data", function () {
  if(helper.config.native) return false;
  pg.connect(helper.config, assert.calls(function (error, client, done) {
    assert.equal(error, null, "Failed to connect: " + helper.sys.inspect(error));
    //intentionally incorrect usage of copy.
    //this has to report error in standart way, instead of just throwing exception
    client.query(
      "COPY (SELECT GENERATE_SERIES(1, 1)) TO STDOUT WITH CSV",
      assert.calls(function (error) {
        assert.ok(error, "error should be reported when sending copy to query with query method");
        client.query("SELECT 1", assert.calls(function (error, result) {
          assert.isNull(error, "incorrect copy usage should not break connection: " + error);
          assert.ok(result, "incorrect copy usage should not break connection");
          done();
        }));
      })
    );
  }));
});

test("COPY FROM incorrect usage", function () {
  pg.connect(helper.config, function (error, client, done) {
    assert.equal(error, null, "Failed to connect: " + helper.sys.inspect(error));
    prepareTable(client, function () {
      //intentionally incorrect usage of copy.
      //this has to report error in standart way, instead of just throwing exception
      client.query(
        "COPY copy_test from STDIN WITH CSV",
        assert.calls(function (error) {
          assert.ok(error, "error should be reported when sending copy to query with query method");
          client.query("SELECT 1", assert.calls(function (error, result) {
            assert.isNull(error, "incorrect copy usage should not break connection: " + error);
            assert.ok(result, "incorrect copy usage should not break connection");
            done();
            pg.end(helper.config);
          }));
        })
      );
    });
  });
});

