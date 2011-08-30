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

test('with drain paused', function() {
  //mock out a fake connection
  var con = new Connection({stream: "NO"});
  con.connect = function() {
    con.emit('connect');
  };
  con.query = function() {
  };

  var client = new Client({connection:con});

  client.connect();

  var drainCount = 0;
  client.on('drain', function() {
    drainCount++;
  });

  test('normally unpaused', function() {
    con.emit('readyForQuery');
    client.query('boom');
    assert.emits(client, 'drain', function() {
      assert.equal(drainCount, 1);
    });
    con.emit('readyForQuery');
  });

  test('pausing', function() {
    test('unpaused with no queries in between', function() {
      client.pauseDrain();
      client.resumeDrain();
      assert.equal(drainCount, 1);
    });

    test('paused', function() {
      test('resumeDrain after empty', function() {
        client.pauseDrain();
        client.query('asdf');
        con.emit('readyForQuery');
        assert.equal(drainCount, 1);
        client.resumeDrain();
        assert.equal(drainCount, 2);
      });

      test('resumDrain while still pending', function() {
        client.pauseDrain();
        client.query('asdf');
        client.query('asdf1');
        con.emit('readyForQuery');
        client.resumeDrain();
        assert.equal(drainCount, 2);
        con.emit('readyForQuery');
        assert.equal(drainCount, 3);
      });

    });
  });

});
