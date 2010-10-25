var net = require('net')
var Connection = require(__dirname+'/../lib/connection');

var con = new Connection({stream: new net.Stream()});
con.connect('5432', 'localhost');

con.on('connect', function() {
  con.startup({
    user: 'brian',
    database: 'postgres'
  });
});

con.on('dataRow', function(msg) {
  console.log(msg.fields);
});

con.on('readyForQuery', function() {
  con.query('select oid, typname from pg_type where typtype = \'b\' order by typname');
});

con.on('commandComplete', function() {
  con.end();
});
