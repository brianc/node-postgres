var helper = require(__dirname + '/../test-helper');
var pg = helper.pg;

test('support for complex column names', function() {
  pg.connect(helper.config, assert.success(function(client, done) {
    client.query("CREATE TEMP TABLE t ( \"complex''column\" TEXT )");
    client.query('SELECT * FROM t', assert.success(function(res) {
        done();
        assert.strictEqual(res.fields[0].name, "complex''column");
        pg.end();
    }));
  }));
});