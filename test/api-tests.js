require(__dirname+"/test-helper");

//defaults
var client = new Client();
assert.equal(client.user, null);
assert.equal(client.database, null);
assert.equal(client.port, 5432);

var user = 'brian';
var database = 'hello';

var client = new Client({
  user: 'briancarlson',
  database: 'hello',
  port: 321
});

assert.equal(client.user, 'briancarlson');
assert.equal(client.database, 'hello');
assert.equal(client.port, 321);

client.port = 5432;
client.connect();

client.query('create temporary table bang (id integer)');
client.query('insert into bang(id) VALUES(1)');
client.query('select * from bang',function(err, results, fields) {
  assert.equal(err, null);
});
