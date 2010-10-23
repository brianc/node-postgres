var helper = require(__dirname+"/test-helper");
var assert = require('assert');
var client = helper.client();
var rows = [];
//testing the low level 1-1 mapping api of client to postgres messages
//it's cumbersome to use the api this way
client.query('create temporary table bang(id integer)');
client.once('commandComplete', function() {
  client.query('insert into bang(id) values(1)');
  client.once('commandComplete', function() {
    client.query('select * from bang');
    client.on('dataRow', function(row) {
      rows.push(row.fields);
    });
    client.on('readyForQuery',function() {
      client.end();
    });
  });
});

process.on('exit', function() {
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 1);
  assert.equal(rows[0], 1);
});


// client.query('create temporary table bang (id integer)');
// client.query('insert into bang(id) VALUES(1)');
// client.query('select * from bang',function(err, results, fields) {
//   assert.equal(err, null);
// });
