var helper = require(__dirname + "/../test-helper");
var pg = helper.pg;

test('parsing array results', function() {
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);
    client.query("CREATE TEMP TABLE why(names text[], numbors integer[], decimals double precision[])");
    client.query('INSERT INTO why(names, numbors, decimals) VALUES(\'{"aaron", "brian","a b c" }\', \'{1, 2, 3}\', \'{.1, 0.05, 3.654}\')').on('error', console.log);
      test('decimals', function() {
      client.query('SELECT decimals FROM why', assert.success(function(result) {
        assert.lengthIs(result.rows[0].decimals, 3);
        assert.equal(result.rows[0].decimals[0], 0.1);
        assert.equal(result.rows[0].decimals[1], 0.05);
        assert.equal(result.rows[0].decimals[2], 3.654);
        pg.end();
      }))
    })
  }))
})
