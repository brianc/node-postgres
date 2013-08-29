
var helper = require(__dirname + '/../test-helper');
var pg = helper.pg;
test('ability to turn on and off parser', function() {
  if(helper.args.binary) return false;
  pg.connect(helper.config, assert.success(function(client, done) {
    pg.defaults.parseInt8 = true;
    client.query('CREATE TEMP TABLE asdf(id SERIAL PRIMARY KEY)');
    client.query('SELECT COUNT(*) as "count" FROM asdf', assert.success(function(res) {
      pg.defaults.parseInt8 = false;
      client.query('SELECT COUNT(*) as "count" FROM asdf', assert.success(function(res) {
        done();
        assert.strictEqual("0", res.rows[0].count);
        pg.end();
      }));
    }));
  }));
});
