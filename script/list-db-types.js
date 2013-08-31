var helper = require(__dirname + "/../test/integration/test-helper");
var pg = helper.pg;
pg.connect(helper.config, assert.success(function(client) {
  var query = client.query('select oid, typname from pg_type where typtype = \'b\' order by oid');
  query.on('row', console.log);
}))
