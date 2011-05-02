require(__dirname + '/test-helper');
var utils = require(__dirname + "/../../lib/utils");
var Pool = utils.Pool;
var defaults = require(__dirname + "/../../lib").defaults;

//this tests the monkey patching
//to ensure comptability with older
//versions of node
test("EventEmitter.once", function() {

  //an event emitter
  var stream = new MemoryStream();

  var callCount = 0;
  stream.once('single', function() {
    callCount++;
  });

  stream.emit('single');
  stream.emit('single');
  assert.equal(callCount, 1);
});

test('an empty pool', function() {
  test('with no creation method', function() {
    var pool = new Pool(10);
    var brian = {name:'brian'};

    test('can set and get an item', function() {
      pool.checkIn(brian);
      var sync = pool.checkOut(assert.calls(function(err, item) {
        assert.equal(brian, item)
        assert.same(brian, item)
      }))
      assert.ok(sync, "should have fired sync")
    })

    test('checkout blocks until item checked back in', function() {
      var called = false;
      var sync = pool.checkOut(assert.calls(function(err, item) {
        called = true;
        assert.equal(brian, item)
        assert.same(brian, item)
      }))
      assert.ok(sync === false, "Should not have fired sync")
      assert.ok(called === false, "Should not have fired callback yet")
      pool.checkIn(brian)
    })

  })

  test('with a creation method', function() {
    var customName = "first";
    var callCount = 0;
    var pool = new Pool(3, function() {
      return {name: customName + (++callCount)};
    });

    test('creates if pool is not at max size', function() {
      var sync = pool.checkOut(assert.calls(function(err, item) {
        assert.equal(item.name, "first1");
      }))
      assert.ok(sync, "Should have generated item & called callback in sync")
    })

    test('creates again if item is checked out', function() {
      var sync = pool.checkOut(assert.calls(function(err, item) {
        assert.equal(item.name, "first2")
      }))
      assert.ok(sync, "Should have called in sync again")
    })
    var external = {name: 'boom'};
    test('can add another item', function() {
      pool.checkIn(external)
      var sync = pool.checkOut(assert.calls(function(err, item) {
        assert.equal(item.name, 'boom')
      }))
      assert.ok(sync, "Should have fired 3rd in sync")
    })

    test('after pool is full, create is not called again', function() {
      var called = false;
      var sync = pool.checkOut(assert.calls(function(err, item) {
        called = true;
        assert.equal(item.name, 'boom')
      }))
      assert.ok(sync === false, "should not be sync")
      assert.ok(called === false, "should not have called callback")
      pool.checkIn(external);
    })
  })
})

test('a pool with size of zero', function() {
  var index = 0;
  var pool = new Pool(0, function() {
    return index++;
  })
  test('checkin does nothing', function() {
    index = 0;
    pool.checkIn(301813);
    assert.equal(pool.checkOut(assert.calls(function(err, item) {
      assert.equal(item, 0);
    })));
  })
  test('always creates a new item', function() {
    index = 0;
    pool.checkOut(assert.calls(function(err, item) {
      assert.equal(item, 0);
    }))
    pool.checkOut(assert.calls(function(err, item) {
      assert.equal(item, 1);
    }))
    pool.checkOut(assert.calls(function(err, item) {
      assert.equal(item, 2);
    }))
  })
})

test('normalizing connection info', function() {
  test('with objects', function() {
    test('empty object uses defaults', function() {
      var input = {};
      var output = utils.normalizeConnectionInfo(input);
      assert.equal(output.user, defaults.user);
      assert.equal(output.database, defaults.database);
      assert.equal(output.port, defaults.port);
      assert.equal(output.host, defaults.host);
      assert.equal(output.password, defaults.password);
    });

    test('full object ignores defaults', function() {
      var input = {
        user: 'test1',
        database: 'test2',
        port: 'test3',
        host: 'test4',
        password: 'test5'
      };
      assert.equal(utils.normalizeConnectionInfo(input), input);
    });

    test('connection string', function() {
      test('non-unix socket', function() {
        test('uses defaults', function() {
          var input = "";
          var output = utils.normalizeConnectionInfo(input);
          assert.equal(output.user, defaults.user);
          assert.equal(output.database, defaults.database);
          assert.equal(output.port, defaults.port);
          assert.equal(output.host, defaults.host);
          assert.equal(output.password, defaults.password);
        });
        test('ignores defaults if string contains them all', function() {
          var input = "tcp://user1:pass2@host3:3333/databaseName";
          var output = utils.normalizeConnectionInfo(input);
          assert.equal(output.user, 'user1');
          assert.equal(output.database, 'databaseName');
          assert.equal(output.port, 3333);
          assert.equal(output.host, 'host3');
          assert.equal(output.password, 'pass2');
        })
      });

      test('unix socket', function() {
        test('uses defaults', function() {
          var input = "/var/run/postgresql";
          var output = utils.normalizeConnectionInfo(input);
          assert.equal(output.user, process.env.USER);
          assert.equal(output.host, '/var/run/postgresql');
          assert.equal(output.database, process.env.USER);
          assert.equal(output.port, 5432);
        });

        test('uses overridden defaults', function() {
          defaults.host = "/var/run/postgresql";
          defaults.user = "boom";
          defaults.password = "yeah";
          defaults.port = 1234;
          var output = utils.normalizeConnectionInfo("asdf");
          assert.equal(output.user, "boom");
          assert.equal(output.password, "yeah");
          assert.equal(output.port, 1234);
          assert.equal(output.host, "/var/run/postgresql");
        })
      })
    })
  })
})
