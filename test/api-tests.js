require(__dirname+"/test-helper");

//little helper to make a
//fresh client to the test DB
var makeClient = function() {
  return new Client({
    user: 'brian',
    database: 'pgjstest'
  });
};

var client1 = makeClient();
client1.connect();
client1.on('ReadyForQuery', function() {
  console.log('client1 ready for query');
  client1.disconnect();
});

var client2 = makeClient();
client2.connect();
client2.on('ReadyForQuery', function() {
  console.log('client2 ready for query');
  client2.disconnect();
});

var client3 = makeClient();
client3.connect();
client3.on('ReadyForQuery', function() {
  console.log('client3 ready for query');
  var query = client3.query('create temporary table bang (id integer)');
  query.on('end', function() {
    client3.disconnect();
  });

});

// client.query('create temporary table bang (id integer)');
// client.query('insert into bang(id) VALUES(1)');
// client.query('select * from bang',function(err, results, fields) {
//   assert.equal(err, null);
// });
