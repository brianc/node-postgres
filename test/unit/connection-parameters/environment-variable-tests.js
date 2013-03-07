var helper = require(__dirname + '/../test-helper');
var assert = require('assert');
var ConnectionParameters = require(__dirname + '/../../../lib/connection-parameters');
var defaults = require(__dirname + '/../../../lib').defaults;

//clear process.env
var realEnv = {};
for(var key in process.env) {
  realEnv[key] = process.env[key];
  delete process.env[key];
}

test('ConnectionParameters initialized from environment variables', function(t) {
  process.env['PGHOST'] = 'local';
  process.env['PGUSER'] = 'bmc2';
  process.env['PGPORT'] = 7890;
  process.env['PGDATABASE'] = 'allyerbase';
  process.env['PGPASSWORD'] = 'open';

  var subject = new ConnectionParameters();
  assert.equal(subject.host, 'local', 'env host');
  assert.equal(subject.user, 'bmc2', 'env user');
  assert.equal(subject.port, 7890, 'env port');
  assert.equal(subject.database, 'allyerbase', 'env database');
  assert.equal(subject.password, 'open', 'env password');
});

test('ConnectionParameters initialized from mix', function(t) {
  delete process.env['PGPASSWORD'];
  delete process.env['PGDATABASE'];
  var subject = new ConnectionParameters({
    user: 'testing',
    database: 'zugzug'
  });
  assert.equal(subject.host, 'local', 'env host');
  assert.equal(subject.user, 'testing', 'config user');
  assert.equal(subject.port, 7890, 'env port');
  assert.equal(subject.database, 'zugzug', 'config database');
  assert.equal(subject.password, defaults.password, 'defaults password');
});

//clear process.env
for(var key in process.env) {
  delete process.env[key];
}

test('connection string parsing', function(t) {
  var string = 'postgres://brian:pw@boom:381/lala';
  var subject = new ConnectionParameters(string);
  assert.equal(subject.host, 'boom', 'string host');
  assert.equal(subject.user, 'brian', 'string user');
  assert.equal(subject.password, 'pw', 'string password');
  assert.equal(subject.port, 381, 'string port');
  assert.equal(subject.database, 'lala', 'string database');
});

//restore process.env
for(var key in realEnv) {
  process.env[key] = realEnv[key];
}
