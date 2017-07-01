'use strict';

var test = require('tap').test;

var parse = require('../').parse;

test('using connection string in client constructor', function(t){
  var subject = parse('postgres://brian:pw@boom:381/lala');
  t.equal(subject.user,'brian');
  t.equal(subject.password, 'pw');
  t.equal(subject.host, 'boom');
  t.equal(subject.port, '381');
  t.equal(subject.database, 'lala');
  t.end();
});

test('escape spaces if present', function(t){
  var subject = parse('postgres://localhost/post gres');
  t.equal(subject.database, 'post gres');
  t.end();
});

test('do not double escape spaces', function(t){
  var subject = parse('postgres://localhost/post%20gres');
  t.equal(subject.database, 'post gres');
  t.end();
});

test('initializing with unix domain socket', function(t){
  var subject = parse('/var/run/');
  t.equal(subject.host, '/var/run/');
  t.end();
});

test('initializing with unix domain socket and a specific database, the simple way', function(t){
  var subject = parse('/var/run/ mydb');
  t.equal(subject.host, '/var/run/');
  t.equal(subject.database, 'mydb');
  t.end();
});

test('initializing with unix domain socket, the health way', function(t){
  var subject = parse('socket:/some path/?db=my[db]&encoding=utf8');
  t.equal(subject.host, '/some path/');
  t.equal(subject.database, 'my[db]', 'must to be escaped and unescaped trough "my%5Bdb%5D"');
  t.equal(subject.client_encoding, 'utf8');
  t.end();
});

test('initializing with unix domain socket, the escaped health way', function(t){
  var subject = parse('socket:/some%20path/?db=my%2Bdb&encoding=utf8');
  t.equal(subject.host, '/some path/');
  t.equal(subject.database, 'my+db');
  t.equal(subject.client_encoding, 'utf8');
  t.end();
});

test('password contains  < and/or >  characters', function(t){
  var sourceConfig = {
    user:'brian',
    password: 'hello<ther>e',
    port: 5432,
    host: 'localhost',
    database: 'postgres'
  };
  var connectionString = 'postgres://' + sourceConfig.user + ':' + sourceConfig.password + '@' + sourceConfig.host + ':' + sourceConfig.port + '/' + sourceConfig.database;
  var subject = parse(connectionString);
  t.equal(subject.password, sourceConfig.password);
  t.end();
});

test('password contains colons', function(t){
  var sourceConfig = {
    user:'brian',
    password: 'hello:pass:world',
    port: 5432,
    host: 'localhost',
    database: 'postgres'
  };
  var connectionString = 'postgres://' + sourceConfig.user + ':' + sourceConfig.password + '@' + sourceConfig.host + ':' + sourceConfig.port + '/' + sourceConfig.database;
  var subject = parse(connectionString);
  t.equal(subject.password, sourceConfig.password);
  t.end();
});

test('username or password contains weird characters', function(t){
  var strang = 'pg://my f%irst name:is&%awesome!@localhost:9000';
  var subject = parse(strang);
  t.equal(subject.user, 'my f%irst name');
  t.equal(subject.password, 'is&%awesome!');
  t.equal(subject.host, 'localhost');
  t.end();
});

test('url is properly encoded', function(t){
  var encoded = 'pg://bi%25na%25%25ry%20:s%40f%23@localhost/%20u%2520rl';
  var subject = parse(encoded);
  t.equal(subject.user, 'bi%na%%ry ');
  t.equal(subject.password, 's@f#');
  t.equal(subject.host, 'localhost');
  t.equal(subject.database, ' u%20rl');
  t.end();
});

test('relative url sets database', function(t){
  var relative = 'different_db_on_default_host';
  var subject = parse(relative);
  t.equal(subject.database, 'different_db_on_default_host');
  t.end();
});

test('no pathname returns null database', function (t) {
  var subject = parse('pg://myhost');
  t.equal(subject.host, 'myhost');
  t.type(subject.database, 'null');

  t.end();
});

test('pathname of "/" returns null database', function (t) {
  var subject = parse('pg://myhost/');
  t.equal(subject.host, 'myhost');
  t.type(subject.database, 'null');

  t.end();
});

test('configuration parameter application_name', function(t){
  var connectionString = 'pg:///?application_name=TheApp';
  var subject = parse(connectionString);
  t.equal(subject.application_name, 'TheApp');
  t.end();
});

test('configuration parameter fallback_application_name', function(t){
  var connectionString = 'pg:///?fallback_application_name=TheAppFallback';
  var subject = parse(connectionString);
  t.equal(subject.fallback_application_name, 'TheAppFallback');
  t.end();
});

test('configuration parameter fallback_application_name', function(t){
  var connectionString = 'pg:///?fallback_application_name=TheAppFallback';
  var subject = parse(connectionString);
  t.equal(subject.fallback_application_name, 'TheAppFallback');
  t.end();
});

test('configuration parameter ssl=true', function(t){
  var connectionString = 'pg:///?ssl=true';
  var subject = parse(connectionString);
  t.equal(subject.ssl, true);
  t.end();
});

test('configuration parameter ssl=1', function(t){
  var connectionString = 'pg:///?ssl=1';
  var subject = parse(connectionString);
  t.equal(subject.ssl, true);
  t.end();
});

test('set ssl', function (t) {
   var subject = parse('pg://myhost/db?ssl=1');
   t.equal(subject.ssl, true);
   t.end();
 });
 
 test('allow other params like max, ...', function (t) {
   var subject = parse('pg://myhost/db?max=18&min=4');
   t.equal(subject.max, '18');
   t.equal(subject.min, '4');
   t.end();
 });
 

test('configuration parameter keepalives', function(t){
  var connectionString = 'pg:///?keepalives=1';
  var subject = parse(connectionString);
  t.equal(subject.keepalives, '1');
  t.end();
});

test('unknown configuration parameter is passed into client', function(t){
  var connectionString = 'pg:///?ThereIsNoSuchPostgresParameter=1234';
  var subject = parse(connectionString);
  t.equal(subject.ThereIsNoSuchPostgresParameter, '1234');
  t.end();
});

test('do not override a config field with value from query string', function(t){
  var subject = parse('socket:/some path/?db=my[db]&encoding=utf8&client_encoding=bogus');
  t.equal(subject.host, '/some path/');
  t.equal(subject.database, 'my[db]', 'must to be escaped and unescaped trough "my%5Bdb%5D"');
  t.equal(subject.client_encoding, 'utf8');
  t.end();
});


test('return last value of repeated parameter', function(t){
  var connectionString = 'pg:///?keepalives=1&keepalives=0';
  var subject = parse(connectionString);
  t.equal(subject.keepalives, '0');
  t.end();
});

