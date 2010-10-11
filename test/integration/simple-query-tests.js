require(__dirname+"/test-helper");

//little helper to make a
//fresh client to the test DB
var makeClient = function() {
  var client = new Client({
    user: 'brian',
    database: 'pgjstest'
  });
  client.on('Error', function(msg) {
    console.log(msg);
  });
  return client;
};

var client3 = makeClient();
client3.connect();
client3.on('ReadyForQuery', function() {
  console.log('client3 ready for query');
});
client3.query('create temporary table bang (id integer)');
client3.query('insert into bang(id) VALUES(1)');
var query = client3.query('select * from bang');
query.on('row', function(row) {
  console.log(row);
});
query.on('end', function() {
  client3.disconnect();
});


// client.query('create temporary table bang (id integer)');
// client.query('insert into bang(id) VALUES(1)');
// client.query('select * from bang',function(err, results, fields) {
//   assert.equal(err, null);
// });
