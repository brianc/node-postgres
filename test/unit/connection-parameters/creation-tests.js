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
  assert.ok(new ConnectionParameters('pg://localhost/postgres'), 'with connection string');
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
});
