require(__dirname+"/test-helper");

//defaults


var client = new Client({
  user: 'brian',
  database: 'pgjstest'
});
client.connect();

client.query('create temporary table bang (id integer)');
client.query('insert into bang(id) VALUES(1)');
client.query('select * from bang',function(err, results, fields) {
  assert.equal(err, null);
});
