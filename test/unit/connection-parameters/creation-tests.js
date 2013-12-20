var helper = require(__dirname + '/../test-helper');
var assert = require('assert');
var ConnectionParameters = require(__dirname + '/../../../lib/connection-parameters');
var defaults = require(__dirname + '/../../../lib').defaults;

//clear process.env
for(var key in process.env) {
  delete process.env[key];
}

test('ConnectionParameters construction', function() {
  assert.ok(new ConnectionParameters(), 'with null config');
  assert.ok(new ConnectionParameters({user: 'asdf'}), 'with config object');
  assert.ok(new ConnectionParameters('postgres://localhost/postgres'), 'with connection string');
});

var compare = function(actual, expected, type) {
  assert.equal(actual.user, expected.user, type + ' user');
  assert.equal(actual.database, expected.database, type + ' database');
  assert.equal(actual.port, expected.port, type + ' port');
  assert.equal(actual.host, expected.host, type + ' host');
  assert.equal(actual.password, expected.password, type + ' password');
  assert.equal(actual.binary, expected.binary, type + ' binary');
};

test('ConnectionParameters initializing from defaults', function() {
  var subject = new ConnectionParameters();
  compare(subject, defaults, 'defaults');
  assert.ok(subject.isDomainSocket === false);
});

test('ConnectionParameters initializing from config', function() {
  var config = {
    user: 'brian',
    database: 'home',
    port: 7777,
    password: 'pizza',
    binary: true,
    encoding: 'utf8',
    host: 'yo',
    ssl: {
      asdf: 'blah'
    }
  };
  var subject = new ConnectionParameters(config);
  compare(subject, config, 'config');
  assert.ok(subject.isDomainSocket === false);
});

test('escape spaces if present', function() {
  subject = new ConnectionParameters('postgres://localhost/post gres');
  assert.equal(subject.database, 'post gres');
});

test('do not double escape spaces', function() {
  subject = new ConnectionParameters('postgres://localhost/post%20gres');
  assert.equal(subject.database, 'post gres');
});

test('initializing with unix domain socket', function() {
  var subject = new ConnectionParameters('/var/run/');
  assert.ok(subject.isDomainSocket);
  assert.equal(subject.host, '/var/run/');
  assert.equal(subject.database, defaults.user);
});

test('initializing with unix domain socket and a specific database, the simple way', function() {
  var subject = new ConnectionParameters('/var/run/ mydb');
  assert.ok(subject.isDomainSocket);
  assert.equal(subject.host, '/var/run/');
  assert.equal(subject.database, 'mydb');
});

test('initializing with unix domain socket, the health way', function() {
  var subject = new ConnectionParameters('socket:/some path/?db=my[db]&encoding=utf8');
  assert.ok(subject.isDomainSocket);
  assert.equal(subject.host, '/some path/');
  assert.equal(subject.database, 'my[db]', 'must to be escaped and unescaped trough "my%5Bdb%5D"');
  assert.equal(subject.client_encoding, 'utf8');
});

test('initializing with unix domain socket, the escaped health way', function() {
  var subject = new ConnectionParameters('socket:/some%20path/?db=my%2Bdb&encoding=utf8');
  assert.ok(subject.isDomainSocket);
  assert.equal(subject.host, '/some path/');
  assert.equal(subject.database, 'my+db');
  assert.equal(subject.client_encoding, 'utf8');
});

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
    var subject = new ConnectionParameters(config);
    subject.getLibpqConnectionString(assert.calls(function(err, constring) {
      assert.isNull(err);
      var parts = constring.split(" ");
      checkForPart(parts, "user='brian'");
      checkForPart(parts, "password='xyz'");
      checkForPart(parts, "port='888'");
      checkForPart(parts, "hostaddr=127.0.0.1");
      checkForPart(parts, "dbname='bam'");
    }));
  });

  test('builds dns string', function() {
    var config = {
      user: 'brian',
      password: 'asdf',
      port: 5432,
      host: 'localhost'
    };
    var subject = new ConnectionParameters(config);
    subject.getLibpqConnectionString(assert.calls(function(err, constring) {
      assert.isNull(err);
      var parts = constring.split(" ");
      checkForPart(parts, "user='brian'");
      checkForPart(parts, "hostaddr=127.0.0.1");
    }));
  });

  test('error when dns fails', function() {
    var config = {
      user: 'brian',
      password: 'asf',
      port: 5432,
      host: 'asdlfkjasldfkksfd#!$!!!!..com'
    };
    var subject = new ConnectionParameters(config);
    subject.getLibpqConnectionString(assert.calls(function(err, constring) {
      assert.ok(err);
      assert.isNull(constring)
    }));
  });

  test('connecting to unix domain socket', function() {
    var config = {
      user: 'brian',
      password: 'asf',
      port: 5432,
      host: '/tmp/'
    };
    var subject = new ConnectionParameters(config);
    subject.getLibpqConnectionString(assert.calls(function(err, constring) {
      assert.isNull(err);
      var parts = constring.split(" ");
      checkForPart(parts, "user='brian'");
      checkForPart(parts, "host=/tmp/");
    }));
  });

  test("encoding can be specified by config", function() {
    var config = {
      client_encoding: "utf-8"
    }
    var subject = new ConnectionParameters(config);
    subject.getLibpqConnectionString(assert.calls(function(err, constring) {
      assert.isNull(err);
      var parts = constring.split(" ");
      checkForPart(parts, "client_encoding='utf-8'");
    }));
  })

  test('password contains  < and/or >  characters', function () {
    return false;
    var sourceConfig = {
      user:'brian',
      password: 'hello<ther>e',
      port: 5432,
      host: 'localhost',
      database: 'postgres'
    }
    var connectionString = 'postgres://' + sourceConfig.user + ':' + sourceConfig.password + '@' + sourceConfig.host + ':' + sourceConfig.port + '/' + sourceConfig.database;
    var subject = new ConnectionParameters(connectionString);
    assert.equal(subject.password, sourceConfig.password);
  });

  test('password contains weird characters', function() {
    var defaults = require('../../../lib/defaults');
    defaults.ssl = true;
    var strang = 'postgres://my first name:is&%awesome!@localhost:9000';
    var subject = new ConnectionParameters(strang);
    assert.equal(subject.user, 'my first name');
    assert.equal(subject.password, 'is&%awesome!');
    assert.equal(subject.host, 'localhost');
    assert.equal(subject.ssl, true);
  });

  test('ssl is set on client', function() {
    var Client = require('../../../lib/client')
    var defaults = require('../../../lib/defaults');
    defaults.ssl = true;
    var c = new Client('postgres://user@password:host/database')
    assert(c.ssl, 'Client should have ssl enabled via defaults')
  })

});
