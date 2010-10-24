var helper = require(__dirname+"/test-helper");
var assert = require('assert');

var rows = [];
//testing the low level 1-1 mapping api of client to postgres messages
//it's cumbersome to use the api this way
helper.connect(function(con) {
  con.query('select * from ids');
  con.on('dataRow', function(msg) {
    console.log("row: " + sys.inspect(msg.fields));
    rows.push(msg.fields);
  });
  con.once('readyForQuery', function() {
    con.end();
  });
});

process.on('exit', function() {
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 1);
  assert.strictEqual(rows[0] [0], '1');
  assert.strictEqual(rows[1] [0], '2');
});


// client.query('create temporary table bang (id integer)');
// client.query('insert into bang(id) VALUES(1)');
// client.query('select * from bang',function(err, results, fields) {
//   assert.equal(err, null);
// });
