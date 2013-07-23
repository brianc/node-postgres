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

test('initializing with unix domain socket', function() {
  var subject = new ConnectionParameters('/var/run/');
  assert.ok(subject.isDomainSocket);
  assert.equal(subject.host, '/var/run/');
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
    var strang = 'postgres://my first name:is&%awesome!@localhost:9000';
    var subject = new ConnectionParameters(strang);
    assert.equal(subject.user, 'my first name');
    assert.equal(subject.password, 'is&%awesome!');
    assert.equal(subject.host, 'localhost');
  });

});
