var test = require('tap').test;

var ConnectionParameters = require(__dirname + '/../../../lib/connection-parameters');
var defaults = require(__dirname + '/../../../lib').defaults;

//clear process.env
for(var key in process.env) {
  delete process.env[key];
}

test('ConnectionParameters construction', function(t) {
  t.ok(new ConnectionParameters(), 'with null config');
  t.ok(new ConnectionParameters({user: 'asdf'}), 'with config object');
  t.ok(new ConnectionParameters('pg://localhost/postgres'), 'with connection string');
  t.end();
})

var compare = function(t, actual, expected, type) {
  t.equal(actual.user, expected.user, type + ' user');
  t.equal(actual.database, expected.database, type + ' database');
  t.equal(actual.port, expected.port, type + ' port');
  t.equal(actual.host, expected.host, type + ' host');
  t.equal(actual.password, expected.password, type + ' password');
  t.equal(actual.binary, expected.binary, type + ' binary');
}

test('ConnectionParameters initializing from defaults', function(t) {
  var subject = new ConnectionParameters();
  compare(t, subject, defaults, 'defaults');
  t.end();
})

test('ConnectionParameters initializing from config', function(t) {
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
  }
  var subject = new ConnectionParameters(config);
  compare(t, subject, config, 'config');
  t.end();
})
