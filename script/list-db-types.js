var Client = require(__dirname+"/../lib/client");
var client = new Client({
  user: 'brian',
  database: 'postgres'
});
client.connect();
var query = client.query('select oid, typname, typlen from pg_type where typtype = \'b\' order by typname');
query.on('row', function(row) {
  console.log(row);
});
query.on('end',function() {
  client.disconnect();
})

