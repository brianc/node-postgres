require(__dirname+"/test-helper");

//defaults
var client = new Client();
assert.equal(client.user, null);
assert.equal(client.database, null);
assert.equal(client.port, 5432);

var client = new Client({
  user: 'brian',
  database: 'pgjstest',
  port: 321
});

assert.equal(client.user, 'brian');
assert.equal(client.database, 'pgjstest');
assert.equal(client.port, 321);

client.port = 5432;
client.connect(function() {
  console.log('connected');
  client.query('select count(*) from items',function(result) {
    console.log('ran query');
  });
});

