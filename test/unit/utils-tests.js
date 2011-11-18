require(__dirname + '/test-helper');
var utils = require(__dirname + "/../../lib/utils");
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

test('libpq connection string building', function() {
  var checkForPart = function(array, part) {
    assert.ok(array.indexOf(part) > -1, array.join(" ") + " did not contain " + part);
  }

  test('builds simple string', function() {
    var config = {
      user: 'brian',
      password: 'xyz',
      port: 888,
      host: 'localhost',
      database: 'bam'
    }
    utils.buildLibpqConnectionString(config, assert.calls(function(err, constring) {
      assert.isNull(err)
      var parts = constring.split(" ");
      checkForPart(parts, "user='brian'")
      checkForPart(parts, "password='xyz'")
      checkForPart(parts, "port='888'")
      checkForPart(parts, "hostaddr=127.0.0.1")
      checkForPart(parts, "dbname='bam'")
    }))
  })
  test('builds dns string', function() {
    var config = {
      user: 'brian',
      password: 'asdf',
      port: 5432,
      host: 'localhost'
    }
    utils.buildLibpqConnectionString(config, assert.calls(function(err, constring) {
      assert.isNull(err);
      var parts = constring.split(" ");
      checkForPart(parts, "user='brian'")
      checkForPart(parts, "hostaddr=127.0.0.1")
    }))
  })

  test('error when dns fails', function() {
    var config = {
      user: 'brian',
      password: 'asf',
      port: 5432,
      host: 'asdlfkjasldfkksfd#!$!!!!..com'
    }
    utils.buildLibpqConnectionString(config, assert.calls(function(err, constring) {
      assert.ok(err);
      assert.isNull(constring)
    }))
  })

})
