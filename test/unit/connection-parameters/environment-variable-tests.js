var test = require('tap').test;

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
  t.equal(subject.host, 'local', 'env host');
  t.equal(subject.user, 'bmc2', 'env user');
  t.equal(subject.port, 7890, 'env port');
  t.equal(subject.database, 'allyerbase', 'env database');
  t.equal(subject.password, 'open', 'env password');
  t.end();
})

test('ConnectionParameters initialized from mix', function(t) {
  delete process.env['PGPASSWORD'];
  delete process.env['PGDATABASE'];
  var subject = new ConnectionParameters({
    user: 'testing',
    database: 'zugzug'
  })
  t.equal(subject.host, 'local', 'env host');
  t.equal(subject.user, 'testing', 'config user');
  t.equal(subject.port, 7890, 'env port');
  t.equal(subject.database, 'zugzug', 'config database');
  t.equal(subject.password, defaults.password, 'defaults password');
  t.end();
})

//clear process.env
for(var key in process.env) {
  delete process.env[key];
}

test('connection string parsing', function(t) {
  var string = 'postgres://brian:pw@boom:381/lala';
  var subject = new ConnectionParameters(string);
  t.equal(subject.host, 'boom', 'string host');
  t.equal(subject.user, 'brian', 'string user');
  t.equal(subject.password, 'pw', 'string password');
  t.equal(subject.port, 381, 'string port');
  t.equal(subject.database, 'lala', 'string database');
  t.end();
})

//restore process.env
for(var key in realEnv) {
  process.env[key] = realEnv[key];
}
