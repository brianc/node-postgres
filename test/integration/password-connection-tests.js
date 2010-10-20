require(__dirname + '/test-helper');
var client = new Client({
  database: 'postgres',
  user: 'user_pw',
  password: 'pass'
});


client.connect();
client.on('message', function(msg) {
  console.log('message: ' + msg.name);
});

var query = client.query('select * from pg_type');

query.on('row', function() {
  console.log('row');
});

query.on('end', function() {
  client.disconnect();
});
