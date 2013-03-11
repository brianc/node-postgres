var helper = require(__dirname + '/test-helper');
var Connection = require(__dirname + '/../../../lib/connection');

test('drain', function() {
  var con = new Connection({stream: "NO"});
  var client = new Client({connection:con});
  con.connect = function() {
    con.emit('connect');
  };
  con.query = function() {
  };
  client.connect();

  var raisedDrain = false;
  client.on('drain', function() {
    raisedDrain = true;
  });

  client.query("hello");
  client.query("sup");
  client.query('boom');

  test("with pending queries", function() {
    test("does not emit drain", function() {
      assert.equal(raisedDrain, false);
    });
  });

  test("after some queries executed", function() {
    con.emit('readyForQuery');
    test("does not emit drain", function() {
      assert.equal(raisedDrain, false);
    });
  });

  test("when all queries are sent", function() {
    con.emit('readyForQuery');
    con.emit('readyForQuery');
    test("does not emit drain", function() {
      assert.equal(raisedDrain, false);
    });
  });

  test("after last query finishes", function() {
    con.emit('readyForQuery');
    test("emits drain", function() {
      process.nextTick(function() {
        assert.ok(raisedDrain);
      })
    });
  });
});
